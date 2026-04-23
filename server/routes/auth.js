import { Router } from 'express';
import { requireAuth, signToken, verifyPassword } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({ token: signToken(), expiresIn: '7d' });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ authenticated: true, role: req.user?.role || 'admin' });
});
