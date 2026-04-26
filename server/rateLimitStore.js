import { db } from './db.js';

/**
 * SQLite-backed store for express-rate-limit.
 * Survives server restarts, so brute-force counters are never reset by a crash
 * or a deliberate bounce. Uses lazy-prepared statements (consistent with the
 * rest of the codebase) so the table must exist before the first request.
 */
export class SqliteStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this._incr = null;
    this._decr = null;
    this._resetKey = null;
    this._get = null;
    this._prune = null;
  }

  _prepare() {
    if (this._incr) return;
    this._incr = db.prepare(`
      INSERT INTO rate_limit_hits (key, window_end, hits) VALUES (?, ?, 1)
      ON CONFLICT(key, window_end) DO UPDATE SET hits = hits + 1
    `);
    this._decr = db.prepare(`
      UPDATE rate_limit_hits SET hits = MAX(0, hits - 1)
      WHERE key = ? AND window_end = ?
    `);
    this._resetKey = db.prepare(`DELETE FROM rate_limit_hits WHERE key = ?`);
    this._get = db.prepare(
      `SELECT hits FROM rate_limit_hits WHERE key = ? AND window_end = ?`,
    );
    this._prune = db.prepare(`DELETE FROM rate_limit_hits WHERE window_end < ?`);
  }

  _windowEnd() {
    const now = Date.now();
    return Math.ceil(now / this.windowMs) * this.windowMs;
  }

  async increment(key) {
    this._prepare();
    const windowEnd = this._windowEnd();
    this._incr.run(key, windowEnd);
    this._prune.run(Date.now());
    const row = this._get.get(key, windowEnd);
    return { totalHits: row?.hits ?? 1, resetTime: new Date(windowEnd) };
  }

  async decrement(key) {
    this._prepare();
    this._decr.run(key, this._windowEnd());
  }

  async resetKey(key) {
    this._prepare();
    this._resetKey.run(key);
  }
}
