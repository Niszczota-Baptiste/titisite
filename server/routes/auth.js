import bcrypt from 'bcryptjs';
import { Router } from 'express';
import {
  clearSessionCookie,
  requireAuth,
  revokeRequestToken,
  setSessionCookie,
} from '../auth.js';
import { findByEmail } from '../users.js';

// Dummy hash used when the email doesn't exist, so the bcrypt work factor is
// always paid regardless of whether the account exists. This prevents
// user-enumeration via response-time differences.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findByEmail(email);
  const hash = user?.password_hash ?? DUMMY_HASH;
  const valid = typeof password === 'string' && password.length > 0
    && bcrypt.compareSync(password, hash);
  if (!user || !valid) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  setSessionCookie(res, user);
  // No token in body — the cookie is the source of truth. We still return the
  // public user info so the SPA can populate its UI without a follow-up GET.
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    expiresIn: '7d',
  });
});

authRouter.post('/logout', (req, res) => {
  // Best-effort revocation: blocklist the current token so even if it leaked
  // before the logout, it can't be replayed for the rest of its TTL.
  revokeRequestToken(req);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});
