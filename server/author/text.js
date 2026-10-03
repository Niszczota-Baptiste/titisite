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

// Extrait de recherche (snippet FTS, quelques dizaines de mots) → texte
// lisible : un lien [[cible|texte]] devient son texte affiché, et un lien
// coupé par le découpage de l'extrait perd ses crochets. `dropCutTarget`
// (lecture invitée) retire en plus une cible coupée en fin d'extrait — elle
// pourrait être le titre d'une idée privée. Entrée bornée : un extrait n'a
// jamais cette taille, et les motifs ancrés restent ainsi bon marché.
export function cleanSnippet(text, { dropCutTarget = false } = {}) {
  if (typeof text !== 'string' || (!text.includes('[[') && !text.includes(']]'))) return text;
  return mapWikiLinks(text.slice(0, 2000), (target, label) => label || target)
    .replace(/^[^[\]|]*\|([^[\]]*)\]\]/, '$1') //   « …cible|texte]] » en tête
    .replace(/^([^[\]]*)\]\]/, '$1') //             « …texte]] » en tête
    .replace(/\[\[[^\]|]*\|([^\]]*)$/, '$1') //     « [[cible|texte… » en fin
    .replace(/\[\[([^\]]*)$/, dropCutTarget ? '' : '$1'); // « [[cible… » en fin
}

// ── Liens [[Nom]] et lecture invitée ────────────────────────────────────────

// Clé de comparaison d'un nom (marqueurs de surlignage \u0002 \u0003 ignorés).
export function nameKey(s) {
  return normalize(String(s).replace(/[\u0002\u0003]/g, '')).trim();
}

// Parcourt les liens [[cible]] / [[cible|texte]] (mêmes règles que le rendu
// client : contenu non vide, sans « ] ») et remplace chacun par fn(cible,
// texte). Balayage à la main plutôt qu'une expression régulière : une
// expression non ancrée revient en arrière à chaque « [[ » sans fermeture et
// devient quadratique sur un long chapitre ; ici chaque caractère est lu une
// fois.
export function mapWikiLinks(text, fn) {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('[[', i);
    if (open < 0) break;
    const rb = text.indexOf(']', open + 2);
    if (rb < 0) break; // plus aucun « ] » : plus aucun lien possible
    if (rb === open + 2 || text[rb + 1] !== ']') {
      // Pas de lien qui commence avant rb : on reprend juste après.
      out += text.slice(i, rb + 1);
      i = rb + 1;
      continue;
    }
    const inner = text.slice(open + 2, rb);
    const bar = inner.indexOf('|');
    const target = bar < 0 ? inner : inner.slice(0, bar);
    const label = bar < 0 ? '' : inner.slice(bar + 1);
    const rep = fn(target, label, text.slice(open, rb + 2));
    out += text.slice(i, open) + rep;
    i = rb + 2;
  }
  return out + text.slice(i);
}

// Remplace un lien [[cible|texte]] par son texte affiché quand la cible est
// dans `hidden` (Set de nameKey), ou TOUS les liens si `hidden` est null (la
// liseuse : aucune fiche à ouvrir). Sans libellé, le nom écrit reste : il est
// déjà dans la prose.
export function scrubWikiLinks(text, hidden) {
  if (typeof text !== 'string' || !text.includes('[[')) return text;
  return mapWikiLinks(text, (target, label, raw) => (hidden && !hidden.has(nameKey(target)) ? raw : (label || target).trim()));
}
