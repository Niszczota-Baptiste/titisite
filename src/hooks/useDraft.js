import { useEffect, useRef } from 'react';

// localStorage autosave for long text editors (chapter content, feature
// descriptions). A draft is `{ value, ts }`; `ts` lets the editor decide
// whether the draft is newer than the server copy before offering a restore.

const DEBOUNCE_MS = 5000;

export function readDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// Debounced (5 s) draft writer. Only writes while `enabled` — pass false when
// the value matches the server copy so we don't litter localStorage.
export function useDraftAutosave(key, value, enabled = true) {
  const timer = useRef(null);
  useEffect(() => {
    if (!key || !enabled) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() })); } catch { /* quota */ }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [key, value, enabled]);
}

// A draft worth offering: exists, differs from the current server value, and
// is newer than the server's updated_at (seconds) when one is known.
export function restorableDraft(key, serverValue, serverUpdatedAtSec) {
  const draft = readDraft(key);
  if (!draft || typeof draft.value !== 'string') return null;
  if (draft.value === (serverValue || '')) return null;
  if (serverUpdatedAtSec && draft.ts <= serverUpdatedAtSec * 1000) return null;
  return draft;
}
