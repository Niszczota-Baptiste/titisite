import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TOKEN_TTL = '7d';

if (!SECRET) {
  console.warn('[auth] JWT_SECRET is not set — admin endpoints will reject all requests.');
}
if (!ADMIN_PASSWORD) {
  console.warn('[auth] ADMIN_PASSWORD is not set — login will always fail.');
}

export function verifyPassword(password) {
  if (!ADMIN_PASSWORD) return false;
  if (typeof password !== 'string') return false;
  if (password.length !== ADMIN_PASSWORD.length) return false;
  let mismatch = 0;
  for (let i = 0; i < password.length; i++) {
    mismatch |= password.charCodeAt(i) ^ ADMIN_PASSWORD.charCodeAt(i);
  }
  return mismatch === 0;
}

export function signToken(payload = {}) {
  if (!SECRET) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ role: 'admin', ...payload }, SECRET, { expiresIn: TOKEN_TTL });
}

export function requireAuth(req, res, next) {
  if (!SECRET) return res.status(500).json({ error: 'server_misconfigured' });
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
