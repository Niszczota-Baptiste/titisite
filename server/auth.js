import jwt from 'jsonwebtoken';
import { findById } from './users.js';

const SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '7d';

if (!SECRET) {
  console.warn('[auth] JWT_SECRET is not set — protected endpoints will reject all requests.');
}

export function signToken(user) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

export function requireAuth(req, res, next) {
  if (!SECRET) return res.status(500).json({ error: 'server_misconfigured' });
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    const user = findById(decoded.sub);
    if (!user) return res.status(401).json({ error: 'user_not_found' });
    req.user = user;
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
