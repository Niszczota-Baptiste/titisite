// Builds the absolute URL prefix used in user-facing links (currently the
// iCal feed URLs). The Host header and X-Forwarded-Proto are attacker-
// controlled inputs (Host-header injection, cache poisoning), so in
// production we refuse to derive them from the request and require
// CANONICAL_ORIGIN to be set explicitly. In dev we fall back to the request
// host so localhost workflows keep working without extra configuration.
export function canonicalBase(req) {
  if (process.env.CANONICAL_ORIGIN) return process.env.CANONICAL_ORIGIN;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CANONICAL_ORIGIN required in production');
  }
  return (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');
}

// Boot-time guard so the server fails loudly on startup rather than the first
// time a user opens the iCal panel. Call this from server/index.js.
export function assertCanonicalOriginConfigured() {
  if (process.env.NODE_ENV !== 'production') return;
  const v = process.env.CANONICAL_ORIGIN;
  if (!v) {
    throw new Error('CANONICAL_ORIGIN must be set in production (e.g. https://yourdomain.com)');
  }
  let parsed;
  try { parsed = new URL(v); } catch {
    throw new Error(`CANONICAL_ORIGIN is not a valid URL: ${v}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`CANONICAL_ORIGIN must use http or https, got: ${parsed.protocol}`);
  }
}
