import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const analyticsRouter = Router();

// The visitor-hash salt MUST be secret — with a public fallback anyone could
// recompute hashes offline and de-anonymise visitors. Fail fast instead.
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET must be set (used as the analytics visitor-hash salt)');
}
const MAX_PATH = 512;
const MAX_REFERRER = 255;
// Hard cap on a single page-timing beacon. 30 minutes covers any realistic
// long-read session and prevents a tampered client from skewing the averages
// with multi-day values.
const MAX_DWELL_MS = 30 * 60 * 1000;

// Retention cap on raw analytics rows. One week is enough for the dashboard's
// day-to-day reading and keeps the privacy promise tight: raw beacons are kept
// at most 7 days, never longer. Called at boot from server/index.js, after
// migrate() has created the tables.
const RETENTION_DAYS = 7;
export function purgeOldAnalytics() {
  const cutoff = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 86400;
  let purged = 0;
  for (const table of ['pageviews', 'events', 'page_timings', 'link_clicks']) {
    purged += db.prepare(`DELETE FROM ${table} WHERE created_at < ?`).run(cutoff).changes;
  }
  if (purged > 0) console.log(`[analytics] purged ${purged} rows older than ${RETENTION_DAYS} days.`);
  return purged;
}

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

// Country is read ONLY from a header the reverse proxy is trusted to overwrite
// on every request (Cloudflare's CF-IPCountry, an Nginx GeoIP module, …).
// Behind plain Nginx with no geo module the header would be raw client input —
// trivially spoofable to poison the country stats — so it stays DISABLED by
// default: set GEO_COUNTRY_HEADER (e.g. "cf-ipcountry") only once such a proxy
// is actually in front and overwriting it.
const GEO_HEADER = (process.env.GEO_COUNTRY_HEADER || '').trim().toLowerCase();
function countryFromReq(req) {
  if (!GEO_HEADER) return '';
  // eslint-disable-next-line security/detect-object-injection -- GEO_HEADER is an env constant, not user input
  const c = String(req.headers[GEO_HEADER] || '').slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' ? c : '';
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

// Sanitize a path-like string from the public beacon. Must start with '/',
// no protocol/host (those go through to_host instead), bounded length.
function sanitizePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > MAX_PATH) return null;
  // Drop query/fragment — they may carry tokens.
  const q = raw.indexOf('?');
  const h = raw.indexOf('#');
  let end = raw.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return raw.slice(0, end);
}

// Should this path be excluded from analytics entirely? Back-office routes
// (admin/project workspaces) are private and not interesting for public stats.
function isBackOfficePath(p) {
  return p.startsWith('/admin') || p.startsWith('/project');
}

// Interaction events we accept from the public site. Anything else is dropped
// so a tampered client can't fill the table with arbitrary names.
const EVENT_NAMES = new Set(['link_click', 'track_play', 'project_view', 'contact_submit']);
const MAX_LABEL = 120;
const CLICK_KINDS = new Set(['writing_nav', 'writing_external', 'internal', 'external']);

let _insertHit;
let _upsertFirstSeen;
analyticsRouter.post('/hit', (req, res) => {
  const path = sanitizePath(req.body?.path);
  if (!path) return res.status(400).json({ error: 'invalid_path' });
  // Don't record the authenticated back-office; analytics is about the public site.
  if (isBackOfficePath(path)) return res.status(204).end();

  if (!_insertHit) {
    _insertHit = db.prepare(
      `INSERT INTO pageviews (path, referrer, device, browser, country, visitor_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
  }
  if (!_upsertFirstSeen) {
    _upsertFirstSeen = db.prepare(
      `INSERT OR IGNORE INTO path_first_seen (path, first_seen_at)
       VALUES (?, strftime('%s','now'))`,
    );
  }
  _insertHit.run(
    path,
    referrerHost(req.body?.referrer, req.hostname),
    deviceFromUA(req.headers['user-agent']),
    browserFromUA(req.headers['user-agent']),
    countryFromReq(req),
    visitorHash(req),
  );
  _upsertFirstSeen.run(path);
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

// End-of-visit beacon: dwell time (active ms only) + scroll depth (0..100).
// Sent via navigator.sendBeacon on pagehide / route unmount. Fire-and-forget.
let _insertTiming;
analyticsRouter.post('/track', (req, res) => {
  const path = sanitizePath(req.body?.path);
  if (!path) return res.status(400).json({ error: 'invalid_path' });
  if (isBackOfficePath(path)) return res.status(204).end();

  let duration = Number(req.body?.durationMs);
  if (!Number.isFinite(duration) || duration < 0) return res.status(400).json({ error: 'invalid_duration' });
  duration = Math.min(Math.floor(duration), MAX_DWELL_MS);

  let scroll = Number(req.body?.scrollPct);
  if (!Number.isFinite(scroll)) scroll = 0;
  scroll = Math.max(0, Math.min(100, Math.floor(scroll)));

  if (!_insertTiming) {
    _insertTiming = db.prepare(
      `INSERT INTO page_timings (path, duration_ms, scroll_pct, visitor_hash)
       VALUES (?, ?, ?, ?)`,
    );
  }
  _insertTiming.run(path, duration, scroll, visitorHash(req));
  res.status(204).end();
});

// Enriched link-click beacon (internal nav + outbound + writing-zone hops).
let _insertClick;
analyticsRouter.post('/click', (req, res) => {
  const from = sanitizePath(req.body?.from);
  if (!from) return res.status(400).json({ error: 'invalid_from' });
  if (isBackOfficePath(from)) return res.status(204).end();

  const kind = req.body?.kind;
  if (typeof kind !== 'string' || !CLICK_KINDS.has(kind)) {
    return res.status(400).json({ error: 'invalid_kind' });
  }

  let toPath = '';
  let toHost = '';
  const rawTo = req.body?.to;
  if (typeof rawTo === 'string' && rawTo.length <= MAX_PATH) {
    if (rawTo.startsWith('/')) {
      toPath = sanitizePath(rawTo) || '';
    } else {
      try {
        const u = new URL(rawTo);
        toHost = u.hostname.slice(0, MAX_REFERRER);
        // Same-origin "external" — store the pathname; otherwise drop the
        // path entirely (it may carry tokens we don't want to keep).
        if (u.hostname === req.hostname) {
          toPath = sanitizePath(u.pathname) || '';
          toHost = '';
        }
      } catch {
        return res.status(400).json({ error: 'invalid_to' });
      }
    }
  }

  if (!_insertClick) {
    _insertClick = db.prepare(
      `INSERT INTO link_clicks (from_path, to_path, to_host, kind, visitor_hash)
       VALUES (?, ?, ?, ?, ?)`,
    );
  }
  _insertClick.run(from, toPath, toHost, kind, visitorHash(req));
  res.status(204).end();
});

// ─── Admin dashboard ────────────────────────────────────────────────────────

// Session = consecutive page hits from the same daily visitor_hash separated by
// less than 30 minutes. Computed on the fly in JS from the raw pageview stream
// (the table stays narrow & cheap; reporting traffic on this endpoint is low).
const SESSION_GAP_MS = 30 * 60 * 1000;
function buildSessions(rows) {
  // rows: { visitor_hash, path, created_at } ordered by visitor_hash, created_at.
  const sessions = [];
  let current = null;
  for (const r of rows) {
    if (
      current
      && current.visitor === r.visitor_hash
      && r.created_at * 1000 - current.lastAt * 1000 < SESSION_GAP_MS
    ) {
      current.paths.push(r.path);
      current.lastAt = r.created_at;
    } else {
      if (current) sessions.push(current);
      current = { visitor: r.visitor_hash, paths: [r.path], firstAt: r.created_at, lastAt: r.created_at };
    }
  }
  if (current) sessions.push(current);
  return sessions;
}

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

  // ── New pages : path_first_seen ∩ period, joined with view counts ──
  const recentPages = db.prepare(
    `SELECT pfs.path                                   AS path,
            pfs.first_seen_at                          AS first_seen_at,
            COALESCE(v.views, 0)                       AS views,
            COALESCE(v.visitors, 0)                    AS visitors
     FROM path_first_seen pfs
     LEFT JOIN (
       SELECT path,
              COUNT(*) AS views,
              COUNT(DISTINCT visitor_hash) AS visitors
       FROM pageviews
       WHERE created_at >= ?
       GROUP BY path
     ) v ON v.path = pfs.path
     WHERE pfs.first_seen_at >= ?
     ORDER BY pfs.first_seen_at DESC
     LIMIT 20`,
  ).all(since, since);

  // ── Engagement : sessions, bounce rate, avg session length ──
  const sessionRows = db.prepare(
    `SELECT visitor_hash, path, created_at FROM pageviews
     WHERE created_at >= ? AND visitor_hash <> ''
     ORDER BY visitor_hash, created_at`,
  ).all(since);
  const sessions = buildSessions(sessionRows);
  const sessionCount = sessions.length;
  const bouncedSessions = sessions.filter((s) => s.paths.length === 1).length;
  const bounceRate = sessionCount ? Math.round((bouncedSessions / sessionCount) * 100) : 0;
  const totalSessionSec = sessions.reduce((acc, s) => acc + Math.max(0, s.lastAt - s.firstAt), 0);
  const avgSessionSec = sessionCount ? Math.round(totalSessionSec / sessionCount) : 0;

  // Entry / exit pages (first / last hit of each session).
  const entryTally = new Map();
  const exitTally = new Map();
  for (const s of sessions) {
    const first = s.paths[0];
    const last = s.paths[s.paths.length - 1];
    entryTally.set(first, (entryTally.get(first) || 0) + 1);
    exitTally.set(last, (exitTally.get(last) || 0) + 1);
  }
  const topN = (map, n) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([path, count]) => ({ path, count }));
  const entryPages = topN(entryTally, 8);
  const exitPages = topN(exitTally, 8);

  // ── Dwell time per top path : avg + median (median resists outliers) ──
  const topPathsList = topPaths.slice(0, 10).map((p) => p.path);
  const timingStmt = db.prepare(
    `SELECT duration_ms FROM page_timings
     WHERE path = ? AND created_at >= ? AND duration_ms > 0
     ORDER BY duration_ms`,
  );
  const dwell = topPathsList.map((path) => {
    const rows = timingStmt.all(path, since);
    if (rows.length === 0) return { path, count: 0, avgSec: 0, medianSec: 0 };
    const total = rows.reduce((a, r) => a + r.duration_ms, 0);
    const median = rows[Math.floor(rows.length / 2)].duration_ms;
    return {
      path,
      count: rows.length,
      avgSec: Math.round(total / rows.length / 1000),
      medianSec: Math.round(median / 1000),
    };
  });

  // ── Scroll depth thresholds per top path ──
  const scrollStmt = db.prepare(
    `SELECT
       COUNT(*) AS n,
       SUM(CASE WHEN scroll_pct >= 25  THEN 1 ELSE 0 END) AS s25,
       SUM(CASE WHEN scroll_pct >= 50  THEN 1 ELSE 0 END) AS s50,
       SUM(CASE WHEN scroll_pct >= 75  THEN 1 ELSE 0 END) AS s75,
       SUM(CASE WHEN scroll_pct >= 100 THEN 1 ELSE 0 END) AS s100
     FROM page_timings
     WHERE path = ? AND created_at >= ?`,
  );
  const scrollDepth = topPathsList.map((path) => {
    const r = scrollStmt.get(path, since);
    const n = r?.n || 0;
    const pct = (x) => (n ? Math.round((x / n) * 100) : 0);
    return {
      path,
      samples: n,
      p25: pct(r?.s25 || 0),
      p50: pct(r?.s50 || 0),
      p75: pct(r?.s75 || 0),
      p100: pct(r?.s100 || 0),
    };
  });

  res.json({
    days,
    totals,
    prev,
    series,
    topPaths,
    topReferrers,
    devices,
    browsers,
    countries,
    events,
    recentPages,
    engagement: {
      sessions: sessionCount,
      bounceRate,
      avgSessionSec,
      entryPages,
      exitPages,
      dwell,
      scrollDepth,
    },
  });
});

// ── Writing-zone focused summary ────────────────────────────────────────────
// All paths starting with /projets/ecriture. The 3rd segment is the project
// slug (e.g. "nostra", "le-trone-d-obsidienne"), the 4th segment is the work
// slug (book/letter/etc) or "personnages".
function parseWritingPath(p) {
  // /projets/ecriture/:project/:work?
  const parts = p.split('/').filter(Boolean);
  if (parts[0] !== 'projets' || parts[1] !== 'ecriture') return null;
  return {
    project: parts[2] || '',
    work: parts[3] || '',
    rest: parts.slice(4).join('/'),
    depth: parts.length,
  };
}

analyticsRouter.get('/summary/writing', requireAuth, requireRole('admin'), (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const allViews = db.prepare(
    `SELECT path, visitor_hash, created_at FROM pageviews
     WHERE created_at >= ? AND path LIKE '/projets/ecriture%'
     ORDER BY visitor_hash, created_at`,
  ).all(since);

  // Totals for the zone.
  const zoneTotals = {
    views: allViews.length,
    visitors: new Set(allViews.map((r) => r.visitor_hash).filter(Boolean)).size,
  };

  // Per-project totals.
  const projectTally = new Map();
  const workTally = new Map(); // key: project|work → {views, visitors:Set}
  for (const r of allViews) {
    const parsed = parseWritingPath(r.path);
    if (!parsed) continue;
    const proj = parsed.project || '(index)';
    if (!projectTally.has(proj)) projectTally.set(proj, { views: 0, visitors: new Set() });
    const pt = projectTally.get(proj);
    pt.views += 1;
    if (r.visitor_hash) pt.visitors.add(r.visitor_hash);

    if (parsed.work && parsed.work !== 'personnages') {
      const key = `${proj}|${parsed.work}`;
      if (!workTally.has(key)) workTally.set(key, { views: 0, visitors: new Set() });
      const wt = workTally.get(key);
      wt.views += 1;
      if (r.visitor_hash) wt.visitors.add(r.visitor_hash);
    }
  }
  const projects = [...projectTally.entries()]
    .map(([slug, v]) => ({ slug, views: v.views, visitors: v.visitors.size }))
    .sort((a, b) => b.views - a.views);
  const topWorks = [...workTally.entries()]
    .map(([key, v]) => {
      const [project, work] = key.split('|');
      return { project, work, views: v.views, visitors: v.visitors.size };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 15);

  // Click transitions inside the writing zone (kind = writing_nav).
  const transitions = db.prepare(
    `SELECT from_path, to_path, COUNT(*) AS count FROM link_clicks
     WHERE created_at >= ? AND kind = 'writing_nav'
       AND from_path LIKE '/projets/ecriture%'
     GROUP BY from_path, to_path
     ORDER BY count DESC
     LIMIT 15`,
  ).all(since);

  // Entry / exit of the writing zone: sessions whose first/last writing hit
  // came right after / before something else (or session boundary).
  const fullSessions = buildSessions(db.prepare(
    `SELECT visitor_hash, path, created_at FROM pageviews
     WHERE created_at >= ? AND visitor_hash <> ''
     ORDER BY visitor_hash, created_at`,
  ).all(since));

  const entryTally = new Map();
  const exitTally = new Map();
  for (const s of fullSessions) {
    let lastWriting = '';
    let prev = '';
    for (const cur of s.paths) {
      if (cur.startsWith('/projets/ecriture')) {
        if (!prev.startsWith('/projets/ecriture')) {
          entryTally.set(cur, (entryTally.get(cur) || 0) + 1);
        }
        lastWriting = cur;
      }
      prev = cur;
    }
    if (lastWriting) {
      exitTally.set(lastWriting, (exitTally.get(lastWriting) || 0) + 1);
    }
  }
  const topMap = (m) => [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));
  const entryPaths = topMap(entryTally);
  const exitPaths = topMap(exitTally);

  // Outbound clicks from the writing zone (kind = writing_external).
  const outbound = db.prepare(
    `SELECT to_host, COUNT(*) AS count FROM link_clicks
     WHERE created_at >= ? AND kind = 'writing_external' AND to_host <> ''
     GROUP BY to_host ORDER BY count DESC LIMIT 10`,
  ).all(since);

  // Dwell time on writing pages (top works only).
  const writingPaths = topWorks.map((w) => `/projets/ecriture/${w.project}/${w.work}`);
  const timingStmt = db.prepare(
    `SELECT duration_ms, scroll_pct FROM page_timings
     WHERE path = ? AND created_at >= ? AND duration_ms > 0
     ORDER BY duration_ms`,
  );
  const dwell = writingPaths.map((path) => {
    const rows = timingStmt.all(path, since);
    if (rows.length === 0) return { path, count: 0, avgSec: 0, medianSec: 0, avgScroll: 0 };
    const total = rows.reduce((a, r) => a + r.duration_ms, 0);
    const median = rows[Math.floor(rows.length / 2)].duration_ms;
    const avgScroll = Math.round(rows.reduce((a, r) => a + r.scroll_pct, 0) / rows.length);
    return {
      path,
      count: rows.length,
      avgSec: Math.round(total / rows.length / 1000),
      medianSec: Math.round(median / 1000),
      avgScroll,
    };
  }).filter((d) => d.count > 0);

  res.json({
    days,
    zoneTotals,
    projects,
    topWorks,
    transitions,
    entryPaths,
    exitPaths,
    outbound,
    dwell,
  });
});
