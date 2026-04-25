import crypto from 'node:crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Attach a CSRF token cookie on every response if not already present.
// The cookie is NOT httpOnly so the SPA can read it via document.cookie.
export function attachCsrfCookie(req, res, next) {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  next();
}

// Verify that mutating requests carry a matching X-CSRF-Token header.
// Safe methods (GET, HEAD, OPTIONS) are skipped.
export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const fromCookie = req.cookies[CSRF_COOKIE];
  const fromHeader = req.headers[CSRF_HEADER];
  if (!fromCookie || !fromHeader || fromCookie !== fromHeader) {
    return res.status(403).json({ error: 'csrf_invalid' });
  }
  next();
}
