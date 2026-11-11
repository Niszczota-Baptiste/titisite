import { defaultTakeLabel } from './time.js';

// Enregistreur du navigateur (MediaRecorder). Utilisé sur le site, et en repli
// dans l'aperçu navigateur de l'application. La prise vit en mémoire jusqu'à
// son envoi : sur le web, sans réseau, on propose de la télécharger plutôt que
// de prétendre l'avoir gardée.
//
// - Le micro n'est demandé qu'à `prepare()` (au moment d'enregistrer).
// - Traitements de la voix désactivés (annulation d'écho, réduction de bruit,
//   gain automatique) : ils abîment un instrument.
// - Un morceau par seconde : si le micro disparaît ou si la page est
//   interrompue, ce qui précède est déjà là — la prise est rendue « récupérée ».

const MIMES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

function fail(code, cause) {
  const err = new Error(code);
  err.code = code;
  err.cause = cause;
  return err;
}

function micAllowedByPage() {
  try {
    const policy = document.permissionsPolicy || document.featurePolicy;
    return policy?.allowsFeature ? policy.allowsFeature('microphone') : true;
  } catch { return true; }
}

export function createWebRecorder() {
  let stream = null;
  let rec = null;
  let chunks = [];
  let mime = '';
  let markers = [];
  let interrupted = false;
  let startedAt = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let timer = null;
  let stopWaiters = [];
  const listeners = new Set();
  let state = { status: 'idle', elapsedMs: 0, notice: null, error: null };

  const emit = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };
  const elapsed = () => {
    if (!startedAt) return 0;
    const end = state.status === 'paused' ? pausedAt : performance.now();
    return Math.max(0, Math.round(end - startedAt - pausedTotal));
  };
  const tick = () => emit({ elapsedMs: elapsed() });
  const releaseStream = () => { try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* déjà arrêté */ } stream = null; };

  function buildTake() {
    const type = (mime || 'audio/webm').split(';')[0];
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    const capturedAt = Math.floor(Date.now() / 1000);
    return {
      name: `${defaultTakeLabel().replace(/[^\p{L}\p{N}]+/gu, '-')}.${EXT[type] || 'webm'}`,
      mime: type,
      sizeBytes: blob.size,
      durationMs: state.elapsedMs,
      capturedAt,
      source: 'recorded',
      integrity: interrupted ? 'recovered' : 'ok',
      markers: [...markers],
      previewUrl: url,
      toBlob: async () => blob,
      release: () => URL.revokeObjectURL(url),
    };
  }

  function finish() {
    clearInterval(timer);
    const finalMs = elapsed();
    releaseStream();
    emit({ status: 'stopped', elapsedMs: finalMs, notice: interrupted ? 'interrupted' : null });
    const take = chunks.length ? buildTake() : null;
    for (const w of stopWaiters) w(take);
    stopWaiters = [];
  }

  return {
    kind: 'web',
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async prepare() {
      if (stream) return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw fail('unsupported');
      if (!micAllowedByPage()) throw fail('mic_policy');
      emit({ status: 'starting', error: null, notice: null });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        emit({ status: 'idle' });
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw fail(micAllowedByPage() ? 'mic_denied' : 'mic_policy', e);
        if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') throw fail('mic_missing', e);
        if (e?.name === 'NotReadableError') throw fail('mic_busy', e);
        throw fail('mic_denied', e);
      }
      emit({ status: 'ready' });
    },

    async start() {
      await this.prepare();
      mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      chunks = [];
      markers = [];
      interrupted = false;
      pausedTotal = 0;
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined);
      mime = rec.mimeType || mime;
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onerror = () => { interrupted = true; };
      rec.onstop = finish;
      // Micro débranché, autorisation retirée, périphérique repris par le
      // système : on termine proprement avec ce qui a été capté.
      for (const track of stream.getAudioTracks()) {
        track.onended = () => { if (rec?.state !== 'inactive') { interrupted = true; try { rec.stop(); } catch { finish(); } } };
      }
      rec.start(1000);
      startedAt = performance.now();
      timer = setInterval(tick, 200);
      emit({ status: 'recording', elapsedMs: 0 });
    },

    pause() {
      if (rec?.state !== 'recording') return;
      rec.pause();
      pausedAt = performance.now();
      emit({ status: 'paused', elapsedMs: elapsed() });
    },

    resume() {
      if (rec?.state !== 'paused') return;
      pausedTotal += performance.now() - pausedAt;
      rec.resume();
      emit({ status: 'recording' });
    },

    mark(label = '') {
      const marker = { tMs: elapsed(), label, kind: 'marker' };
      markers.push(marker);
      return marker;
    },

    stop() {
      return new Promise((resolve) => {
        if (!rec || rec.state === 'inactive') { resolve(state.status === 'stopped' && chunks.length ? buildTake() : null); return; }
        stopWaiters.push(resolve);
        emit({ status: 'stopping', elapsedMs: elapsed() });
        // L'état « en pause » doit être clos avant l'arrêt pour que la durée soit juste.
        if (rec.state === 'paused') { pausedTotal += performance.now() - pausedAt; }
        rec.stop();
      });
    },

    async cancel() {
      clearInterval(timer);
      chunks = [];
      try { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } } catch { /* déjà arrêté */ }
      releaseStream();
      emit({ status: 'idle', elapsedMs: 0, notice: null });
    },
  };
}
