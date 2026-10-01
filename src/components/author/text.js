// Compteurs côté client (affichage en direct dans l'éditeur). Copie conforme de
// server/author/text.js — le serveur recalcule et stocke ses propres valeurs ;
// test/author-text.test.js vérifie que les deux comptent pareil.

const SPLIT_RE = /[^\p{L}\p{N}'’-]+/u;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;

export function plainText(md) {
  return String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '');
}

export function countWords(md) {
  let n = 0;
  for (const tok of plainText(md).split(SPLIT_RE)) if (HAS_WORD_RE.test(tok)) n += 1;
  return n;
}

export function textStats(md) {
  const plain = plainText(md);
  let words = 0;
  for (const tok of plain.split(SPLIT_RE)) if (HAS_WORD_RE.test(tok)) words += 1;
  return { words, chars: plain.replace(/\n+/g, '').length };
}

// ~230 mots/minute : vitesse de lecture silencieuse courante en français.
export function readingMinutes(words) {
  return Math.max(1, Math.round(words / 230));
}

export function formatCount(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0);
}
