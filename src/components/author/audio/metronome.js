// Métronome et tap tempo — la LOGIQUE, pure et testée
// (test/author-audio-logic.test.js). Le son lui-même est produit par
// Metronome.jsx avec l'horloge audio du navigateur.
//
// Précision : chaque clic est planifié à l'avance sur l'horloge audio
// (AudioContext.currentTime, à l'échantillon près) à partir d'une ANCRE et de
// son rang — t = ancre + rang × 60 / bpm — jamais en ajoutant un intervalle au
// clic précédent : aucune dérive ne s'accumule, même après des heures, et un
// retard du fil d'exécution (page occupée) ne décale pas les clics déjà
// planifiés dans la fenêtre d'anticipation.

export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const clampBpm = (bpm) => Math.min(BPM_MAX, Math.max(BPM_MIN, Number(bpm) || 0));

export const beatTime = (anchor, index, bpm) => anchor + index * (60 / bpm);

// Clics à planifier maintenant : tous ceux qui tombent avant `now + lookahead`
// et qui n'ont pas encore été planifiés (`nextIndex`). Un clic déjà passé
// (fil bloqué plus longtemps que la fenêtre) est sauté, pas joué en retard.
export function dueClicks({ anchor, bpm, beatsPerBar = 4, nextIndex = 0, now, lookahead = 0.12 }) {
  const clicks = [];
  let i = nextIndex;
  for (;;) {
    const time = beatTime(anchor, i, bpm);
    if (time >= now + lookahead) break;
    if (time >= now - 0.002) clicks.push({ index: i, time, accent: beatsPerBar > 0 && i % beatsPerBar === 0 });
    i += 1;
  }
  return { clicks, nextIndex: i };
}

// Changer de tempo en cours de route sans à-coup : le prochain clic garde sa
// place, les suivants prennent le nouvel écart. → nouvelle ancre.
export function retime({ anchor, bpm, nextIndex }, newBpm) {
  const next = beatTime(anchor, nextIndex, bpm);
  return next - nextIndex * (60 / newBpm);
}

// ── Tap tempo ───────────────────────────────────────────────────────────────
// À partir des instants des tapes (ms) : on ne garde que la dernière série
// régulière (un silence de plus de 2,5 s recommence la mesure), on écarte les
// écarts aberrants (tape manquée ou doublée) et on moyenne le reste.
// → { bpm, taps } ou null (moins de deux tapes exploitables).
export const TAP_RESET_MS = 2500;

export function tapTempo(times) {
  const all = (times || []).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  let start = 0;
  for (let i = 1; i < all.length; i += 1) if (all[i] - all[i - 1] > TAP_RESET_MS) start = i;
  const run = all.slice(start).slice(-9);
  if (run.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < run.length; i += 1) gaps.push(run[i] - run[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const kept = gaps.filter((g) => Math.abs(g - median) <= median * 0.3);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  if (!(mean > 0)) return null;
  const bpm = 60000 / mean;
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return { bpm: Math.round(bpm * 10) / 10, taps: run.length };
}

// ── Métronome et enregistrement ────────────────────────────────────────────
// Un clic qui sort du haut-parleur est capté par le micro et reste dans la
// prise. Règle : pendant une prise, le métronome se tait, SAUF si l'on a dit
// l'écouter au casque. Un décompte peut précéder la prise ; il est joué AVANT
// le début de l'enregistrement, donc jamais dedans.
// → { countInBeats, countInMs, clickDuringTake }
export function recordingPlan({ metronomeOn, bpm, beatsPerBar = 4, countInBars = 0, headphones = false }) {
  const on = !!metronomeOn && bpm >= BPM_MIN && bpm <= BPM_MAX;
  const countInBeats = on ? Math.max(0, Math.round(countInBars)) * beatsPerBar : 0;
  return {
    countInBeats,
    countInMs: Math.round(countInBeats * (60000 / (on ? bpm : 60))),
    clickDuringTake: on && !!headphones,
  };
}

// « 3/4 » → 3 temps par mesure (4 par défaut si illisible).
export function beatsFromSignature(sig) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(String(sig || ''));
  const n = m ? Number(m[1]) : 4;
  return n >= 1 && n <= 16 ? n : 4;
}
