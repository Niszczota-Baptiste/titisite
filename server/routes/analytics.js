import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const analyticsRouter = Router();

const SECRET = process.env.JWT_SECRET || 'analytics-fallback-salt';
const MAX_PATH = 512;
const MAX_REFERRER = 255;

// Coarse device bucket from the User-Agent. Good enough for a desktop/mobile
// split without parsing a full UA database.
function deviceFromUA(ua = '') {
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly/i.test(ua)) return 'bot';
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

// Coarse browser family from the User-Agent. Order matters: many UAs lie
// (Edge/Opera/Samsung embed "Chrome", iOS browsers embed "Safari"), so the
// more specific tokens are checked first.
function browserFromUA(ua = '') {
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly/i.test(ua)) return 'bot';
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung';
  if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';
  if (/CriOS\//i.test(ua)) return 'Chrome';
  if (/Chrome\/|Chromium\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari';
  return 'Autre';
}

// Daily-rotating, irreversible visitor fingerprint. The date component means
// the same person gets a different hash tomorrow, so this can't follow anyone
// across days — it only powers "unique visitors per day".
function visitorHash(req) {
  const ip = req.ip || '';
  const ua = req.headers['user-agent'] || '';
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(`${SECRET}|${day}|${ip}|${ua}`).digest('hex').slice(0, 32);
}

// Keep only the hostname of the referrer (drops query strings / paths that
// could carry tokens or PII). Same-origin / empty referrers are stored as ''.
function referrerHost(raw, reqHost) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const u = new URL(raw);
    if (u.hostname === reqHost) return '';
    return u.hostname.slice(0, MAX_REFERRER);
  } catch {
    return '';
  }
}

// Interaction events we accept from the public site. Anything else is dropped
// so a tampered client can't fill the table with arbitrary names.
const EVENT_NAMES = new Set(['link_click', 'track_play', 'project_view', 'contact_submit']);
const MAX_LABEL = 120;

let _insertHit;
analyticsRouter.post('/hit', (req, res) => {
  const path = req.body?.path;
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > MAX_PATH) {
    return res.status(400).json({ error: 'invalid_path' });
  }
  // Don't record the authenticated back-office; analytics is about the public site.
  if (path.startsWith('/admin') || path.startsWith('/project')) return res.status(204).end();

  if (!_insertHit) {
    _insertHit = db.prepare(
      `INSERT INTO pageviews (path, referrer, device, browser, country, visitor_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
  }
  const country = String(req.headers['cf-ipcountry'] || '').slice(0, 2).toUpperCase();
  _insertHit.run(
    path,
    referrerHost(req.body?.referrer, req.hostname),
    deviceFromUA(req.headers['user-agent']),
    browserFromUA(req.headers['user-agent']),
    /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '',
    visitorHash(req),
  );
  res.status(204).end();
});

let _insertEvent;
analyticsRouter.post('/event', (req, res) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !EVENT_NAMES.has(name)) {
    return res.status(400).json({ error: 'invalid_event' });
  }
  const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, MAX_LABEL) : '';
  if (!_insertEvent) {
    _insertEvent = db.prepare(
      `INSERT INTO events (name, label, visitor_hash) VALUES (?, ?, ?)`,
    );
  }
  _insertEvent.run(name, label, visitorHash(req));
  res.status(204).end();
});

// Admin dashboard summary. ?days=N (1..365, default 30).
analyticsRouter.get('/summary', requireAuth, requireRole('admin'), (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const totals = db.prepare(
    `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
     FROM pageviews WHERE created_at >= ?`,
  ).get(since);

  // Same-length window immediately before the current one, for trend deltas.
  const prevSince = since - days * 86400;
  const prev = db.prepare(
    `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
     FROM pageviews WHERE created_at >= ? AND created_at < ?`,
  ).get(prevSince, since);

  const countries = db.prepare(
    `SELECT country, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
     FROM pageviews WHERE created_at >= ? AND country <> ''
     GROUP BY country ORDER BY visitors DESC, views DESC LIMIT 12`,
  ).all(since);

  const series = db.prepare(
    `SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') AS day,
            COUNT(*) AS views,
            COUNT(DISTINCT visitor_hash) AS visitors
     FROM pageviews WHERE created_at >= ?
     GROUP BY day ORDER BY day ASC`,
  ).all(since);

  const topPaths = db.prepare(
    `SELECT path, COUNT(*) AS views FROM pageviews
     WHERE created_at >= ? GROUP BY path ORDER BY views DESC LIMIT 10`,
  ).all(since);

  const topReferrers = db.prepare(
    `SELECT referrer, COUNT(*) AS views FROM pageviews
     WHERE created_at >= ? AND referrer <> '' GROUP BY referrer ORDER BY views DESC LIMIT 10`,
  ).all(since);

  const devices = db.prepare(
    `SELECT device, COUNT(*) AS views FROM pageviews
     WHERE created_at >= ? GROUP BY device ORDER BY views DESC`,
  ).all(since);

  const browsers = db.prepare(
    `SELECT browser, COUNT(*) AS views FROM pageviews
     WHERE created_at >= ? AND browser <> '' GROUP BY browser ORDER BY views DESC`,
  ).all(since);

  // Interaction events: per-name total + the top labels behind each name.
  const eventTotals = db.prepare(
    `SELECT name, COUNT(*) AS count FROM events
     WHERE created_at >= ? GROUP BY name`,
  ).all(since);
  const topLabelsStmt = db.prepare(
    `SELECT label, COUNT(*) AS count FROM events
     WHERE name = ? AND created_at >= ? AND label <> ''
     GROUP BY label ORDER BY count DESC LIMIT 8`,
  );
  const events = [...EVENT_NAMES].map((name) => ({
    name,
    total: eventTotals.find((e) => e.name === name)?.count || 0,
    labels: topLabelsStmt.all(name, since),
  }));

  res.json({ days, totals, prev, series, topPaths, topReferrers, devices, browsers, countries, events });
});
