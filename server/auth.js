import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { findById } from './users.js';

const SECRET = process.env.JWT_SECRET;
const TOKEN_TTL_DAYS = 7;
const TOKEN_TTL = `${TOKEN_TTL_DAYS}d`;
const COOKIE_NAME = 'titisite_session';

if (!SECRET) {
  console.warn('[auth] JWT_SECRET is not set — protected endpoints will reject all requests.');
}

function newJti() {
  return crypto.randomBytes(16).toString('hex');
}

export function signToken(user) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: TOKEN_TTL, jwtid: newJti() },
  );
}

export function setSessionCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_TTL_DAYS * 24 * 3600 * 1000,
    path: '/',
  });
  return token;
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

function readToken(req) {
  // 1. HttpOnly cookie (default for browser SPA traffic)
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  // 2. Authorization header — kept as a fallback for non-browser clients
  //    (e.g. server-to-server), still useful while we transition.
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

let _isRevoked;
let _insertRevoked;
let _pruneRevoked;
function prepareRevocationStmts() {
  if (_isRevoked) return;
  _isRevoked = db.prepare(`SELECT 1 FROM revoked_tokens WHERE jti = ?`);
  _insertRevoked = db.prepare(
    `INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)`,
  );
  _pruneRevoked = db.prepare(`DELETE FROM revoked_tokens WHERE expires_at < ?`);
}

// Add a token to the blocklist. `exp` is the JWT's expiry (seconds since
// epoch); past expiry there's no point keeping the row.
export function revokeToken({ jti, sub, exp }) {
  if (!jti || !exp) return;
  prepareRevocationStmts();
  _insertRevoked.run(jti, sub ?? null, exp);
  // Lazy prune so the table stays bounded without a background job.
  _pruneRevoked.run(Math.floor(Date.now() / 1000));
}

// Convenience: revoke whatever cookie/Bearer the caller is presenting.
export function revokeRequestToken(req) {
  const raw = readToken(req);
  if (!raw) return;
  const decoded = jwt.decode(raw);
  if (decoded && decoded.jti && decoded.exp) {
    revokeToken({ jti: decoded.jti, sub: decoded.sub, exp: decoded.exp });
  }
}

export function requireAuth(req, res, next) {
  if (!SECRET) return res.status(500).json({ error: 'server_misconfigured' });
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    prepareRevocationStmts();
    if (decoded.jti && _isRevoked.get(decoded.jti)) {
      return res.status(401).json({ error: 'revoked_token' });
    }
    const user = findById(decoded.sub);
    if (!user) return res.status(401).json({ error: 'user_not_found' });
    req.user = user;
    req.token = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
