import { db } from './db.js';

let _insert;
function stmt() {
  if (!_insert) {
    _insert = db.prepare(
      `INSERT INTO audit_log (action, user_id, ip, meta) VALUES (?, ?, ?, ?)`,
    );
  }
  return _insert;
}

/**
 * Append an audit entry synchronously (fire-and-forget from the caller's POV).
 * @param {string} action  — e.g. 'login', 'logout', 'user.delete', 'ical.rotate'
 * @param {object} opts
 * @param {number} [opts.userId]  — actor's user id
 * @param {string} [opts.ip]      — req.ip
 * @param {object} [opts.meta]    — any extra context (target id, email, old role…)
 */
export function logAudit(action, { userId = null, ip = null, meta = null } = {}) {
  try {
    stmt().run(action, userId, ip, meta ? JSON.stringify(meta) : null);
  } catch (err) {
    // Audit failures must never crash the request
    console.error('[audit] write failed:', err.message);
  }
}
