// Temps, boucles et repères d'une prise audio — fonctions pures, testées dans
// test/author-audio-logic.test.js. Tout est en millisecondes entières.

export function formatMs(ms, { tenths = false } = {}) {
  const total = Math.max(0, Number(ms) || 0);
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  const tail = tenths ? `,${Math.floor((total % 1000) / 100)}` : '';
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}${tail}` : `${m}:${sec}${tail}`;
}

export const clampMs = (ms, durationMs) => Math.min(Math.max(0, Math.round(Number(ms) || 0)), Math.max(0, durationMs || 0));

// Boucle A→B utilisable : bornée à la prise, ordonnée, d'au moins 200 ms
// (en dessous, le lecteur passerait son temps à se repositionner). → null sinon.
export const MIN_LOOP_MS = 200;
export function normalizeLoop(a, b, durationMs) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  let start = clampMs(Math.min(a, b), durationMs);
  let end = clampMs(Math.max(a, b), durationMs);
  if (durationMs && end > durationMs) end = durationMs;
  if (end - start < MIN_LOOP_MS) return null;
  if (start < 0) start = 0;
  return { a: start, b: end };
}

// Pendant la lecture : faut-il revenir au début de la boucle ? → position de
// reprise (ms) ou null. Une position AVANT la boucle n'est pas ramenée (on peut
// écouter l'approche) ; au-delà de la fin, on reprend au début.
export function loopJump(positionMs, loop) {
  if (!loop) return null;
  return positionMs >= loop.b ? loop.a : null;
}

// Repères triés, plages comprises ; `active` = repère ponctuel le plus proche
// avant la position (celui que « repère précédent » doit viser).
export function sortMarkers(markers) {
  return [...(markers || [])].sort((x, y) => x.tMs - y.tMs || (x.id || 0) - (y.id || 0));
}

export function neighbourMarker(markers, positionMs, direction, slackMs = 400) {
  const list = sortMarkers(markers);
  if (direction > 0) return list.find((m) => m.tMs > positionMs + 50) || null;
  const before = list.filter((m) => m.tMs < positionMs - slackMs);
  return before.length ? before[before.length - 1] : null;
}

export const MARKER_LABELS = { marker: 'Repère', loop: 'Boucle', extract: 'Extrait', interruption: 'Interruption' };

// Nom proposé pour une prise sans titre : « Prise du 11 nov. · 08:41 ».
export function defaultTakeLabel(date = new Date()) {
  const d = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
  const t = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `Prise du ${d} · ${t}`;
}

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / 1024 / 1024).toFixed(v < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} Mo`;
}
