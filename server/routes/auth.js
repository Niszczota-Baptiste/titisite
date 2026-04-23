import { Router } from 'express';
import { requireAuth, signToken } from '../auth.js';
import { findByEmail, verifyPassword } from '../users.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = findByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    expiresIn: '7d',
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  res.json({ id, email, name, role });
});
