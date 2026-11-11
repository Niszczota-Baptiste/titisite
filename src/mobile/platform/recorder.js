import { defaultTakeLabel } from '../../components/author/audio/time.js';
import { fileSrc, isNative, native, nativeOn } from './bridge.js';

// Enregistreur NATIF de l'application (plugin AtelierRecorder), au contrat de
// components/author/audio/recorderPort.js.
//
// La prise est écrite directement dans un fichier de l'appareil par un service
// au premier plan : elle continue écran éteint ou application en arrière-plan,
// avec une notification « Enregistrement en cours ». Seuls l'état et le chemin
// du fichier passent par le pont — jamais le son. Un appel téléphonique ou la
// perte du micro met la prise en pause et y pose un repère « Interruption » ;
// un arrêt brutal laisse un fichier que l'application vérifie et récupère au
// lancement suivant (`recoverTakes`), marqué « récupérée ».

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function asTake(t) {
  const url = fileSrc(t.path);
  return {
    name: t.name, mime: t.mime, sizeBytes: t.sizeBytes, durationMs: t.durationMs, capturedAt: t.capturedAt,
    source: 'recorded', integrity: t.integrity === 'recovered' ? 'recovered' : 'ok', markers: t.markers || [],
    previewUrl: url,
    toBlob: async () => { const res = await fetch(url); if (!res.ok) throw fail('file_missing'); return res.blob(); },
    release: () => {},
    // Fichier déjà sur l'appareil : la boîte de réception l'adopte sans copie.
    nativeFile: { id: t.id, role: 'audio', name: t.name, mime: t.mime, size: t.sizeBytes, path: t.path, durationMs: t.durationMs, integrity: t.integrity, markers: t.markers || [], capturedAt: t.capturedAt, label: defaultTakeLabel(new Date((t.capturedAt || 0) * 1000 || Date.now())) },
  };
}

export function createNativeRecorder() {
  const listeners = new Set();
  let state = { status: 'idle', elapsedMs: 0, notice: null, error: null };
  const emit = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };
  const off = nativeOn('AtelierRecorder', 'state', (s) => emit({ status: s.status, elapsedMs: s.elapsedMs ?? state.elapsedMs, notice: s.notice || null }));
  const call = async (method, args) => {
    try { return await native('AtelierRecorder', method, args); }
    catch (e) { throw fail(e.code || 'unsupported', e.message); }
  };

  return {
    kind: 'native',
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async prepare() { await call('prepare'); if (state.status === 'idle') emit({ status: 'ready' }); },
    async start() { await call('start'); },
    pause() { call('pause').catch(() => {}); },
    resume() { call('resume').catch(() => {}); },
    mark(label = '') { call('mark', { label }).catch(() => {}); return { tMs: state.elapsedMs, label, kind: 'marker' }; },
    async stop() { const out = await call('stop'); return out?.take ? asTake(out.take) : null; },
    async cancel() { try { await call('cancel'); } finally { off(); } },
  };
}

// Prises restées inachevées (application tuée, batterie vide…) : vérifiées et
// réparées côté natif, rendues avec `integrity: 'recovered'`. À appeler au
// lancement ; chaque prise n'est rendue qu'une fois.
export async function recoverTakes() {
  if (!isNative()) return [];
  try { return ((await native('AtelierRecorder', 'recover')).takes || []).map(asTake); } catch { return []; }
}

// Une prise est-elle en cours (application relancée pendant un enregistrement) ?
export async function recorderStatus() {
  if (!isNative()) return { status: 'idle' };
  try { return await native('AtelierRecorder', 'status'); } catch { return { status: 'idle' }; }
}
