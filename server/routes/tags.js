import { Router } from 'express';
import { db } from '../db.js';

// Mounted under /api/workspaces/:slug/tags with mergeParams + resolveWorkspace.
export const tagsRouter = Router({ mergeParams: true });

function aggregate(workspaceId) {
  const rows = db.prepare(`SELECT tags FROM features WHERE workspace_id = ?`).all(workspaceId);
  const counts = new Map();
  for (const r of rows) {
    let arr = [];
    try { arr = JSON.parse(r.tags || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      const name = String(t || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

tagsRouter.get('/', (req, res) => {
  res.json(aggregate(req.workspace.id));
});

tagsRouter.put('/:name', (req, res) => {
  const from = decodeURIComponent(req.params.name);
  const { to } = req.body || {};
  const toName = String(to || '').trim();
  if (!toName) return res.status(400).json({ error: 'missing_to' });
  if (toName.toLowerCase() === from.toLowerCase()) {
    return res.json({ renamed: 0 });
  }

  const rows = db.prepare(`SELECT id, tags FROM features WHERE workspace_id = ?`).all(req.workspace.id);
  let changed = 0;
  const tx = db.transaction(() => {
    const upd = db.prepare(`UPDATE features SET tags = ?, updated_at = strftime('%s','now') WHERE id = ?`);
    for (const r of rows) {
      let arr = [];
      try { arr = JSON.parse(r.tags || '[]'); } catch { continue; }
      if (!arr.includes(from)) continue;
      const seen = new Set();
      const next = [];
      for (const t of arr) {
        const v = t === from ? toName : t;
        const k = v.toLowerCase();
        if (!seen.has(k)) { seen.add(k); next.push(v); }
      }
      upd.run(JSON.stringify(next), r.id);
      changed++;
    }
  });
  tx();
  res.json({ renamed: changed, from, to: toName });
});

tagsRouter.delete('/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const rows = db.prepare(`SELECT id, tags FROM features WHERE workspace_id = ?`).all(req.workspace.id);
  let changed = 0;
  const tx = db.transaction(() => {
    const upd = db.prepare(`UPDATE features SET tags = ?, updated_at = strftime('%s','now') WHERE id = ?`);
    for (const r of rows) {
      let arr = [];
      try { arr = JSON.parse(r.tags || '[]'); } catch { continue; }
      const next = arr.filter((t) => t !== name);
      if (next.length !== arr.length) {
        upd.run(JSON.stringify(next), r.id);
        changed++;
      }
    }
  });
  tx();
  res.json({ removed: changed, name });
});
