import { Router } from 'express';
import {
  clearSessionCookie,
  requireAuth,
  revokeRequestToken,
  setSessionCookie,
} from '../auth.js';
import { logAudit } from '../audit.js';
import { findByEmail, verifyPassword } from '../users.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    logAudit('login.fail', { ip: req.ip, meta: { email } });
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  setSessionCookie(res, user);
  logAudit('login', { userId: user.id, ip: req.ip });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    expiresIn: '7d',
  });
});

authRouter.post('/logout', (req, res) => {
  revokeRequestToken(req);
  logAudit('logout', { userId: req.user?.id, ip: req.ip });
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});
