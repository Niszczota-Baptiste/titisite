// Outils texte purs de l'atelier d'auteur (testés dans test/author-text.test.js).
// Partagés par le serveur (compteurs stockés, cohérence, FTS) ; le client a sa
// propre copie pour l'affichage en direct (src/components/author/text.js) —
// les deux doivent compter pareil, d'où les mêmes expressions.

// Mot = suite de lettres/chiffres, élisions et traits d'union inclus :
// « l'homme », « peut-être » et « aujourd'hui » comptent pour un mot, comme
// dans un traitement de texte.
// (Découpe sur tout le reste plutôt qu'une expression à quantificateurs
// imbriqués : linéaire, et sans risque de ReDoS sur un long chapitre.)
const SPLIT_RE = /[^\p{L}\p{N}'’-]+/u;
const HAS_WORD_RE = /[\p{L}\p{N}]/u;

// Retire la syntaxe Markdown qui n'est pas du texte (marqueurs de titre, de
// citation, de liste, d'emphase, séparateurs, URL des liens).
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

// Caractères espaces compris (convention éditoriale « signes »), sans les
// marqueurs Markdown ni les sauts de ligne.
export function countChars(md) {
  return plainText(md).replace(/\n+/g, '').length;
}

export function textStats(md) {
  return { words: countWords(md), chars: countChars(md) };
}

// Forme de comparaison : minuscules, sans accents, apostrophes typographiques
// unifiées. « Élise » et « elise » se confondent, « Lyr » et « Lyra » non.
export function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/’/g, "'")
    .toLowerCase();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nombre d'occurrences de `needle` comme mot entier dans `haystack` (comparaison
// normalisée). Un nom de deux lettres ou moins est ignoré : trop de faux
// positifs pour un signal de cohérence.
export function countOccurrences(haystack, needle) {
  const n = normalize(needle).trim();
  if (n.length < 3) return 0;
  const h = normalize(haystack);
  // eslint-disable-next-line security/detect-non-literal-regexp -- needle est échappé, et borné par les classes \p{L}\p{N}
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, 'gu');
  const m = h.match(re);
  return m ? m.length : 0;
}

// Requête utilisateur → syntaxe MATCH FTS5 sûre : chaque terme entre
// guillemets (les opérateurs FTS de l'utilisateur deviennent du texte) avec un
// joker de préfixe. Même règle que server/lore/store.js#ftsQuery.
export function ftsQuery(q) {
  const terms = String(q || '').split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}
