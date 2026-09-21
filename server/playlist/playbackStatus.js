// All tabs share a bounded read cache; provider HTTP retains the durable 429 gate.
export function createPlaybackStatus(read, now = Date.now) {
  let cached, pending, generation = 0;
  return {
    invalidate() { generation++; cached = null; },
    async get() {
      if (!cached || now() - cached.at >= (cached.error ? 15000 : 5000)) {
        if (!pending) {
          const version = generation;
          pending = (async () => {
            let value;
            try { value = { snapshot: await read(), at: now() }; }
            catch (e) { value = { snapshot: null, at: now(), error: ['playback_permission_required', 'not_connected', 'reconnect_or_permissions', 'rate_limited', 'QUOTA_EXCEEDED'].includes(e.reason) ? e.reason : 'unavailable' }; }
            if (generation === version) cached = value;
          })().finally(() => { pending = null; });
        }
        await pending;
      }
      return cached ? { ...cached, ageMs: Math.max(0, now() - cached.at) } : { snapshot: null, ageMs: 0 };
    },
  };
}
