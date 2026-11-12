import { defaultTakeLabel } from '../../components/author/audio/time.js';
import { fileSrc, isNative, native, nativeOn } from './bridge.js';

// Enregistreur NATIF de l'application (plugin AtelierRecorder), au contrat de
// components/author/audio/recorderPort.js.
//
// La prise est écrite directement dans un fichier de l'appareil par un service
// au premier plan : elle continue écran éteint ou application en arrière-plan,
// avec une notification « Enregistrement en cours ». Seuls l'état et le chemin
// du fichier passent par le pont — jamais le son. Un appel téléphonique ou la
// perte du micro met la prise en pause et y pose un repère « Interruption ».
//
// Une prise n'est jamais perdue en route : tant qu'elle n'a été ni rangée dans
// la boîte de réception ni explicitement libérée (`release`), le natif la
// considère comme due et la rend au prochain `recoverTakes()` — qu'elle ait été
// arrêtée depuis la notification, laissée à l'écran au moment où l'application
// a été fermée, ou coupée net (elle est alors vérifiée, réparée et marquée
// « récupérée »).

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  // Le natif rédige déjà une phrase précise : on la préfère au message générique.
  if (message && message !== code) err.nativeMessage = message;
  return err;
}

function asTake(t) {
  const url = fileSrc(t.path);
  let released = false;
  return {
    name: t.name, mime: t.mime, sizeBytes: t.sizeBytes, durationMs: t.durationMs, capturedAt: t.capturedAt,
    source: 'recorded', integrity: t.integrity === 'recovered' ? 'recovered' : 'ok', markers: t.markers || [],
    previewUrl: url,
    toBlob: async () => { const res = await fetch(url); if (!res.ok) throw fail('file_missing'); return res.blob(); },
    // Rangée dans la boîte de réception : le natif ne touche à rien. Jetée, ou
    // déjà envoyée au site : son fichier local est supprimé.
    release: () => {
      if (released) return;
      released = true;
      native('AtelierRecorder', 'release', { id: t.id }).catch(() => {});
    },
    // Fichier déjà sur l'appareil : la boîte de réception l'adopte sans copie.
    nativeFile: { id: t.id, role: 'audio', name: t.name, mime: t.mime, size: t.sizeBytes, path: t.path, durationMs: t.durationMs, integrity: t.integrity, markers: t.markers || [], capturedAt: t.capturedAt, label: defaultTakeLabel(new Date((t.capturedAt || 0) * 1000 || Date.now())) },
  };
}

export async function createNativeRecorder() {
  const listeners = new Set();
  const takeListeners = new Set();
  let state = { status: 'idle', elapsedMs: 0, notice: null, error: null };
  const emit = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };
  const offState = nativeOn('AtelierRecorder', 'state', (s) => emit({ status: s.status, elapsedMs: s.elapsedMs ?? state.elapsedMs, notice: s.notice || null }));
  const offTake = nativeOn('AtelierRecorder', 'finished', (d) => {
    if (d.take) for (const fn of takeListeners) fn(asTake(d.take));
  });
  const call = async (method, args) => {
    try { return await native('AtelierRecorder', method, args); }
    catch (e) { throw fail(e.code || 'unsupported', e.message); }
  };
  // Une prise est peut-être déjà en cours (écran quitté puis rouvert).
  try {
    const s = await native('AtelierRecorder', 'status');
    if (s?.status && s.status !== 'idle') state = { ...state, status: s.status, elapsedMs: s.elapsedMs || 0, notice: s.notice || null };
  } catch { /* état inconnu : on part de zéro */ }

  return {
    kind: 'native',
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onTake(fn) { takeListeners.add(fn); return () => takeListeners.delete(fn); },
    async prepare() { await call('prepare'); if (state.status === 'idle') emit({ status: 'ready' }); },
    async start() { await call('start'); },
    pause() { call('pause').catch(() => {}); },
    resume() { call('resume').catch(() => {}); },
    mark(label = '') { call('mark', { label }).catch(() => {}); return { tMs: state.elapsedMs, label, kind: 'marker' }; },
    async stop() { const out = await call('stop'); return out?.take ? asTake(out.take) : null; },
    // Quitter l'écran n'arrête PAS une prise en cours : le service continue,
    // la notification reste, et l'écran d'enregistrement la retrouve.
    async cancel() { offState(); offTake(); },
  };
}

// Prises dues et pas encore rangées : terminées hors de l'écran (notification),
// laissées en plan, ou interrompues puis réparées (`integrity: 'recovered'`).
// Chaque prise n'est rendue qu'une fois par session de l'application.
export async function recoverTakes() {
  if (!isNative()) return [];
  try { return ((await native('AtelierRecorder', 'recover')).takes || []).map(asTake); } catch { return []; }
}

// Une prise est-elle en cours ? → { status: 'idle' | 'recording' | 'paused' | 'stopping', elapsedMs }
export async function recorderStatus() {
  if (!isNative()) return { status: 'idle', elapsedMs: 0 };
  try { return await native('AtelierRecorder', 'status'); } catch { return { status: 'idle', elapsedMs: 0 }; }
}

// Suit l'état de l'enregistreur (bandeau « Enregistrement en cours » de l'accueil).
export function onRecorderState(handler) {
  return nativeOn('AtelierRecorder', 'state', handler);
}
