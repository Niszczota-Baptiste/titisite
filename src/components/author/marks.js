// Marques de travail de l'auteur, écrites dans le texte lui-même (Markdown) :
//
//   {{reprendre: passage à retravailler}}   le passage fait partie du texte
//   {{question: note pour moi}}             la note n'en fait pas partie
//   {{variante: version gardée || autre}}   deux versions d'un même passage ;
//                                           seule la première fait partie du texte
//
// Elles restent PRIVÉES : le serveur les retire de tout ce qui sort de
// l'atelier du propriétaire (lecture par un invité, manuscrit exporté, index de
// recherche — server/author/marks.js, copie conforme de la partie « lecture »
// de ce fichier, vérifiée par test/author-marks.test.js), et les compteurs ne
// comptent que le texte gardé. Une marque tient dans un paragraphe.

export const MARK_TYPES = {
  reprendre: { label: 'À reprendre', icon: '🔁', hint: 'Passage à retravailler (il reste dans le texte)' },
  question: { label: 'Question', icon: '❓', hint: 'Note pour moi (hors du texte)' },
  variante: { label: 'Variante', icon: '🔀', hint: 'Garder deux versions d\'un passage' },
};

// Corps borné : une accolade jamais refermée ne fait pas relire tout un roman.
export const MARK_SRC = '\\{\\{\\s*(à reprendre|a reprendre|reprendre|question|variante)\\s*:\\s?([\\s\\S]{0,6000}?)\\}\\}';

export const markType = (raw) => {
  const t = String(raw || '').toLowerCase();
  return t === 'question' || t === 'variante' ? t : 'reprendre';
};

export function splitVariant(body) {
  const cut = body.indexOf('||');
  return { a: (cut < 0 ? body : body.slice(0, cut)).trim(), b: cut < 0 ? '' : body.slice(cut + 2).trim() };
}

export function findMarks(text) {
  const src = String(text ?? '');
  const out = [];
  if (!src.includes('{{')) return out;
  // eslint-disable-next-line security/detect-non-literal-regexp -- MARK_SRC est une constante du module
  const re = new RegExp(MARK_SRC, 'gi');
  let m;
  while ((m = re.exec(src)) !== null) {
    const type = markType(m[1]);
    const body = m[2].trim();
    const mark = { type, start: m.index, end: m.index + m[0].length, raw: m[0], body };
    if (type === 'variante') Object.assign(mark, splitVariant(body));
    out.push(mark);
  }
  return out;
}

// Ce qui remplace UNE marque quand on la retire en gardant `keep` :
// → { start, end, text } (la plage peut déborder d'un espace ou d'une ligne
// pour ne pas laisser de trou).
function removal(src, m, keep, accBefore = null) {
  const before = accBefore ?? src.slice(0, m.start);
  let start = m.start;
  let end = m.end;
  if (!keep) {
    const lineStart = before.lastIndexOf('\n') + 1;
    const nl = src.indexOf('\n', m.end);
    const tail = src.slice(m.end, nl < 0 ? src.length : nl);
    if (!before.slice(lineStart).trim() && !tail.trim()) {
      start = m.start - (before.length - lineStart);
      end = nl < 0 ? src.length : nl + 1;
    } else if (/[ \t]$/.test(before) && /^[ \t]/.test(tail)) {
      end = m.end + 1;
    }
  }
  return { start, end, text: keep };
}

// Texte tel qu'un lecteur doit le voir (voir l'en-tête).
export function cleanMarks(text) {
  const src = String(text ?? '');
  const marks = findMarks(src);
  if (!marks.length) return src;
  let out = '';
  let last = 0;
  for (const m of marks) {
    const acc = out + src.slice(last, m.start);
    const keep = m.type === 'question' ? '' : m.type === 'variante' ? m.a : m.body;
    const r = removal(src, m, keep, acc);
    out = acc.slice(0, acc.length - (m.start - r.start)) + keep;
    last = r.end;
  }
  return out + src.slice(last);
}

// ── Écriture ────────────────────────────────────────────────────────────────

// Texte à insérer pour marquer la sélection, et où poser le curseur ensuite.
// → { text, caret } (caret relatif au début du texte inséré), `after` = la
// marque se place APRÈS la sélection au lieu de l'envelopper.
export function newMark(type, selected = '') {
  const sel = String(selected);
  if (type === 'question') return { text: '{{question: }}', caret: '{{question: '.length, after: true };
  if (type === 'variante') {
    const head = `{{variante: ${sel} || `;
    return { text: `${head}}}`, caret: sel ? head.length : '{{variante: '.length, after: false };
  }
  const head = `{{reprendre: ${sel}`;
  return { text: `${head}}}`, caret: head.length, after: false };
}

// Opérations sur une marque existante → { start, end, text } à appliquer au texte.
export function swapVariant(mark) {
  return { start: mark.start, end: mark.end, text: `{{variante: ${mark.b} || ${mark.a}}}` };
}

// Lever une marque : `keep` = 'a' | 'b' pour une variante ; le passage « à
// reprendre » redevient du texte ordinaire ; la question disparaît.
export function resolveMark(text, mark, keep = 'a') {
  const src = String(text ?? '');
  const kept = mark.type === 'question' ? '' : mark.type === 'variante' ? (keep === 'b' ? mark.b : mark.a) : mark.body;
  return removal(src, mark, kept);
}

export function markSummary(mark, max = 90) {
  const clip = (s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  if (mark.type === 'variante') return { main: clip(mark.a || '(vide)'), alt: clip(mark.b || '(vide)') };
  return { main: clip(mark.body || (mark.type === 'question' ? '(question vide)' : '(passage vide)')), alt: null };
}
