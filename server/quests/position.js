// Position in-game du joueur pour la boussole 🧭. La source est le raccourci
// vanilla F3+C : le client copie dans le presse-papiers une commande du type
//   /execute in minecraft:overworld run tp @s 812.50 62.00 -1044.30 45.0 12.0
// (monde, X/Y/Z, puis yaw/pitch). L'app cockpit locale surveille le
// presse-papiers et POSTe la ligne brute ; on la parse ici. On accepte aussi
// un simple « x y z » (saisie manuelle) et des champs déjà structurés.

import { db } from '../db.js';

/**
 * Parse une ligne F3+C (ou « x y z ») → { world, x, y, z, yaw, pitch } | null.
 * Tokenisation simple (pas de grande regex) : on repère « @s » puis on lit les
 * 3 à 5 nombres qui suivent ; le monde est le token après « in » s'il existe.
 */
export function parseF3C(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 500) return null;
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const at = tokens.indexOf('@s');
  if (at >= 0) {
    const inIdx = tokens.indexOf('in');
    const world = inIdx >= 0 && tokens[inIdx + 1] ? tokens[inIdx + 1] : '';
    const nums = tokens.slice(at + 1, at + 6).map(Number);
    if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) {
      return {
        world,
        x: nums[0], y: nums[1], z: nums[2],
        yaw: Number.isFinite(nums[3]) ? nums[3] : null,
        pitch: Number.isFinite(nums[4]) ? nums[4] : null,
      };
    }
    return null;
  }
  const parts = s.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { world: '', x: parts[0], y: parts[1], z: parts[2], yaw: null, pitch: null };
  }
  return null;
}

const clampCoord = (v) => (Number.isFinite(v) && Math.abs(v) <= 30_000_000 ? v : null);

/** Normalise un payload structuré { world, x, y, z, yaw?, pitch? } | null. */
export function normalizePosition(body) {
  const x = clampCoord(Number(body?.x));
  const y = clampCoord(Number(body?.y));
  const z = clampCoord(Number(body?.z));
  if (x === null || y === null || z === null) return null;
  const angle = (v) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(+v) ? +v : null));
  return {
    world: String(body.world || '').slice(0, 80),
    x, y, z,
    yaw: angle(body.yaw),
    pitch: angle(body.pitch),
  };
}

export function savePosition(userId, pos) {
  db.prepare(`
    INSERT INTO player_positions (user_id, world, x, y, z, yaw, pitch, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(user_id) DO UPDATE SET
      world = excluded.world, x = excluded.x, y = excluded.y, z = excluded.z,
      yaw = excluded.yaw, pitch = excluded.pitch, updated_at = strftime('%s','now')
  `).run(userId, pos.world, pos.x, pos.y, pos.z, pos.yaw, pos.pitch);
  return getPosition(userId);
}

export function getPosition(userId) {
  const r = db.prepare(`SELECT * FROM player_positions WHERE user_id = ?`).get(userId);
  if (!r) return null;
  return {
    world: r.world, x: r.x, y: r.y, z: r.z,
    yaw: r.yaw, pitch: r.pitch, updatedAt: r.updated_at,
  };
}
