// Marques de travail de l'auteur dans un texte — côté serveur : uniquement de
// quoi les RETIRER de ce qui sort de l'atelier privé (lecture par un invité,
// manuscrit exporté, index de recherche, compteurs).
//
//   {{reprendre: passage à retravailler}}   le passage fait partie du texte
//   {{question: note pour moi}}             la note n'en fait pas partie
//   {{variante: version gardée || autre}}   seule la première fait partie du texte
//
// Copie conforme de la partie « lecture » de src/components/author/marks.js ;
// test/author-marks.test.js vérifie que les deux nettoient pareil.

// Corps borné : une accolade jamais refermée ne fait pas relire tout un roman.
const MARK_SRC = '\\{\\{\\s*(à reprendre|a reprendre|reprendre|question|variante)\\s*:\\s?([\\s\\S]{0,6000}?)\\}\\}';

const typeOf = (raw) => {
  const t = raw.toLowerCase();
  return t === 'question' || t === 'variante' ? t : 'reprendre';
};

export function findMarks(text) {
  const src = String(text ?? '');
  const out = [];
  if (!src.includes('{{')) return out;
  // eslint-disable-next-line security/detect-non-literal-regexp -- MARK_SRC est une constante du module
  const re = new RegExp(MARK_SRC, 'gi');
  let m;
  while ((m = re.exec(src)) !== null) {
    const type = typeOf(m[1]);
    const body = m[2].trim();
    const mark = { type, start: m.index, end: m.index + m[0].length, raw: m[0], body };
    if (type === 'variante') {
      const cut = body.indexOf('||');
      mark.a = (cut < 0 ? body : body.slice(0, cut)).trim();
      mark.b = cut < 0 ? '' : body.slice(cut + 2).trim();
    }
    out.push(mark);
  }
  return out;
}

// Texte tel qu'un lecteur doit le voir : le passage « à reprendre » reste, la
// question disparaît (avec sa ligne si elle y était seule), la variante se
// réduit à la version gardée.
export function cleanMarks(text) {
  const src = String(text ?? '');
  const marks = findMarks(src);
  if (!marks.length) return src;
  let out = '';
  let last = 0;
  for (const m of marks) {
    let acc = out + src.slice(last, m.start);
    const keep = m.type === 'question' ? '' : m.type === 'variante' ? m.a : m.body;
    let next = m.end;
    if (!keep) {
      const lineStart = acc.lastIndexOf('\n') + 1;
      const nl = src.indexOf('\n', m.end);
      const tail = src.slice(m.end, nl < 0 ? src.length : nl);
      if (!acc.slice(lineStart).trim() && !tail.trim()) {
        acc = acc.slice(0, lineStart);
        next = nl < 0 ? src.length : nl + 1;
      } else if (/[ \t]$/.test(acc) && /^[ \t]/.test(tail)) {
        next = m.end + 1;
      }
    }
    out = acc + keep;
    last = next;
  }
  return out + src.slice(last);
}
