import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

export const stairsRouter = Router();

// Both admin and members with can_view_stairs=1 can read AND write entries
// (set partagé). Members without the flag are rejected outright.
function requireStairsAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.can_view_stairs === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

stairsRouter.use(requireAuth, requireStairsAccess);

function rowToEntry(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    stepCount: r.step_count,
    stepHeightCm: r.step_height_cm,
    largeSteps: r.large_steps === 1,
    isEven: r.step_count % 2 === 0,
    lat: r.lat,
    lng: r.lng,
    country: r.country,
    region: r.region,
    city: r.city,
    encounteredAt: r.encountered_at,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT s.*, u.name AS created_by_name
  FROM stairs s
  LEFT JOIN users u ON u.id = s.created_by
`;

// ── Nominatim reverse geocoding ──
// Their usage policy caps clients at ~1 req/s and requires a User-Agent that
// identifies the application. We serialize calls through a tiny in-memory queue
// so concurrent saves never burst past that limit even if a user spams the
// regeocode button.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT
  || 'titisite-stairs/1.0 (+https://baptisteniszczota.com)';
let nominatimChain = Promise.resolve();
function throttleNominatim(fn) {
  const next = nominatimChain.then(async () => {
    const out = await fn();
    await new Promise((r) => setTimeout(r, 1100));
    return out;
  });
  // Keep the chain pure (no rejections leak forward) so a single failure
  // doesn't poison every queued request.
  nominatimChain = next.catch(() => null);
  return next;
}

async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_URL}?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&accept-language=fr`;
  return throttleNominatim(async () => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return null;
      const data = await res.json();
      const a = data?.address || {};
      return {
        country: a.country || '',
        region: a.state || a.region || a.county || '',
        city: a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet || '',
      };
    } catch {
      return null;
    }
  });
}

function parseCoord(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function validateLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180;
}

stairsRouter.get('/', (_req, res) => {
  const rows = db.prepare(`${SELECT} ORDER BY s.encountered_at DESC, s.id DESC`).all();
  res.json(rows.map(rowToEntry));
});

stairsRouter.post('/', async (req, res) => {
  const {
    name, notes, stepCount, stepHeightCm, largeSteps,
    lat, lng, country, region, city, encounteredAt,
  } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const count = Math.floor(Number(stepCount));
  if (!Number.isFinite(count) || count <= 0) return res.status(400).json({ error: 'invalid_step_count' });
  const la = parseCoord(lat);
  const lo = parseCoord(lng);
  if (!validateLatLng(la, lo)) return res.status(400).json({ error: 'invalid_coordinates' });
  const ts = Math.floor(Number(encounteredAt));
  if (!Number.isFinite(ts) || ts <= 0) return res.status(400).json({ error: 'invalid_date' });

  const heightRaw = Number(stepHeightCm);
  const height = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : null;

  // Auto reverse-geocode unless the client provided values explicitly (manual
  // fallback when Nominatim previously failed).
  let geo = {
    country: typeof country === 'string' ? country.trim() : '',
    region: typeof region === 'string' ? region.trim() : '',
    city: typeof city === 'string' ? city.trim() : '',
  };
  if (!geo.country && !geo.region && !geo.city) {
    const looked = await reverseGeocode(la, lo);
    if (looked) geo = looked;
  }

  const result = db.prepare(`
    INSERT INTO stairs
      (name, notes, step_count, step_height_cm, large_steps,
       lat, lng, country, region, city, encountered_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    String(notes || '').trim(),
    count,
    height,
    largeSteps ? 1 : 0,
    la,
    lo,
    geo.country,
    geo.region,
    geo.city,
    ts,
    req.user.id,
  );
  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToEntry(row));
});

stairsRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM stairs WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const {
    name, notes, stepCount, stepHeightCm, largeSteps,
    lat, lng, country, region, city, encounteredAt,
  } = req.body || {};

  let nextLat = existing.lat;
  let nextLng = existing.lng;
  let coordsChanged = false;
  if (lat !== undefined || lng !== undefined) {
    const la = parseCoord(lat);
    const lo = parseCoord(lng);
    if (!validateLatLng(la, lo)) return res.status(400).json({ error: 'invalid_coordinates' });
    coordsChanged = la !== existing.lat || lo !== existing.lng;
    nextLat = la;
    nextLng = lo;
  }

  let count = existing.step_count;
  if (stepCount !== undefined) {
    const c = Math.floor(Number(stepCount));
    if (!Number.isFinite(c) || c <= 0) return res.status(400).json({ error: 'invalid_step_count' });
    count = c;
  }

  let ts = existing.encountered_at;
  if (encounteredAt !== undefined) {
    const t = Math.floor(Number(encounteredAt));
    if (!Number.isFinite(t) || t <= 0) return res.status(400).json({ error: 'invalid_date' });
    ts = t;
  }

  let height = existing.step_height_cm;
  if (stepHeightCm !== undefined) {
    const h = Number(stepHeightCm);
    height = Number.isFinite(h) && h > 0 ? h : null;
  }

  const fields = {
    name: name === undefined ? existing.name : String(name).trim(),
    notes: notes === undefined ? existing.notes : String(notes || '').trim(),
    large_steps: largeSteps === undefined ? existing.large_steps : (largeSteps ? 1 : 0),
    country: country === undefined ? existing.country : String(country || '').trim(),
    region: region === undefined ? existing.region : String(region || '').trim(),
    city: city === undefined ? existing.city : String(city || '').trim(),
  };

  // Re-run reverse geocoding if the position moved AND the caller didn't pass
  // explicit geo overrides — that way an admin who manually fixed a country
  // can keep it without us clobbering their edit on a no-op coordinate refresh.
  if (coordsChanged
      && country === undefined && region === undefined && city === undefined) {
    const looked = await reverseGeocode(nextLat, nextLng);
    if (looked) {
      fields.country = looked.country;
      fields.region  = looked.region;
      fields.city    = looked.city;
    }
  }

  if (!fields.name) return res.status(400).json({ error: 'missing_name' });

  db.prepare(`
    UPDATE stairs SET
      name           = ?,
      notes          = ?,
      step_count     = ?,
      step_height_cm = ?,
      large_steps    = ?,
      lat            = ?,
      lng            = ?,
      country        = ?,
      region         = ?,
      city           = ?,
      encountered_at = ?,
      updated_at     = strftime('%s','now')
    WHERE id = ?
  `).run(
    fields.name, fields.notes, count, height, fields.large_steps,
    nextLat, nextLng, fields.country, fields.region, fields.city, ts, id,
  );

  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id);
  res.json(rowToEntry(row));
});

// Manual retry of reverse geocoding — useful when the lookup failed at create
// time (offline, Nominatim down) and the user wants to fill in country/region
// later without re-typing coordinates.
stairsRouter.post('/:id/regeocode', async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM stairs WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const looked = await reverseGeocode(existing.lat, existing.lng);
  if (!looked) return res.status(502).json({ error: 'geocoding_failed' });
  db.prepare(`
    UPDATE stairs SET country = ?, region = ?, city = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(looked.country, looked.region, looked.city, id);
  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id);
  res.json(rowToEntry(row));
});

stairsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM stairs WHERE id = ?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
