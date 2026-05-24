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
      `INSERT INTO pageviews (path, referrer, device, country, visitor_hash)
       VALUES (?, ?, ?, ?, ?)`,
    );
  }
  const country = String(req.headers['cf-ipcountry'] || '').slice(0, 2).toUpperCase();
  _insertHit.run(
    path,
    referrerHost(req.body?.referrer, req.hostname),
    deviceFromUA(req.headers['user-agent']),
    /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : '',
    visitorHash(req),
  );
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

  res.json({ days, totals, series, topPaths, topReferrers, devices });
});
