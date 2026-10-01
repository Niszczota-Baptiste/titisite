// Opérations d'édition sur un <textarea> Markdown. Elles passent par
// document.execCommand('insertText') quand le navigateur le permet : c'est la
// seule façon de garder l'annulation native (Ctrl/⌘ Z) après un formatage.
// Repli : setRangeText + événement input.

export function replaceRange(ta, start, end, text, selStart = null, selEnd = null) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) {
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (selStart !== null) ta.setSelectionRange(selStart, selEnd ?? selStart);
}

// **gras**, *italique* : entoure la sélection, ou la retire si déjà entourée.
export function toggleWrap(ta, marker) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const m = marker.length;
  if (value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
    replaceRange(ta, s - m, e + m, value.slice(s, e), s - m, e - m);
    return;
  }
  const sel = value.slice(s, e);
  if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= 2 * m) {
    replaceRange(ta, s, e, sel.slice(m, -m), s, e - 2 * m);
    return;
  }
  replaceRange(ta, s, e, `${marker}${sel}${marker}`, s + m, e + m);
}

function lineBounds(value, s, e) {
  const start = value.lastIndexOf('\n', s - 1) + 1;
  let end = value.indexOf('\n', e);
  if (end < 0) end = value.length;
  return [start, end];
}

const HEADING_RE = /^#{1,6}\s+/;

// Titre de niveau n : remplace un titre existant, ou le retire s'il est déjà
// à ce niveau.
export function setHeading(ta, level) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const [a, b] = lineBounds(value, s, e);
  const line = value.slice(a, b);
  const prefix = `${'#'.repeat(level)} `;
  const bare = line.replace(HEADING_RE, '');
  const next = line.startsWith(prefix) && !line.startsWith(`${prefix}#`) ? bare : prefix + bare;
  const caret = a + next.length;
  replaceRange(ta, a, b, next, caret);
}

// Préfixe de ligne (citation, listes) sur toutes les lignes sélectionnées.
export function toggleLinePrefix(ta, kind) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const [a, b] = lineBounds(value, s, e);
  const lines = value.slice(a, b).split('\n');
  const re = kind === 'quote' ? /^>\s?/ : kind === 'ol' ? /^\d+\.\s+/ : /^[-*+]\s+/;
  const all = lines.every((l) => re.test(l) || !l.trim());
  const out = lines.map((l, i) => {
    if (all) return l.replace(re, '');
    if (!l.trim() && lines.length > 1) return l;
    const clean = l.replace(/^(>\s?|\d+\.\s+|[-*+]\s+)/, '');
    if (kind === 'quote') return `> ${clean}`;
    if (kind === 'ol') return `${i + 1}. ${clean}`;
    return `- ${clean}`;
  }).join('\n');
  replaceRange(ta, a, b, out, a, a + out.length);
}

export function insertSeparator(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const before = value.slice(0, s);
  const lead = before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const text = `${lead}---\n\n`;
  replaceRange(ta, s, e, text, s + text.length);
}

// Typographie française : « » avec espaces insécables, … et —.
const NBSP = ' ';
export function frenchQuote(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  if (s !== e) { replaceRange(ta, s, e, `«${NBSP}${value.slice(s, e)}${NBSP}»`, s + 2, e + 2); return true; }
  const prev = value[s - 1];
  const opening = !prev || /[\s([{—–-]/.test(prev);
  const text = opening ? `«${NBSP}` : `${prev === ' ' ? '' : NBSP}»`;
  replaceRange(ta, s, e, text, s + text.length);
  return true;
}

// Après une frappe : « ... » → « … », « -- » → « — ». Renvoie true si modifié.
export function autoTypography(ta) {
  const { selectionStart: s, value } = ta;
  if (ta.selectionEnd !== s) return false;
  if (value.slice(s - 3, s) === '...') { replaceRange(ta, s - 3, s, '…', s - 2); return true; }
  if (value.slice(s - 2, s) === '--' && value[s - 3] !== '-') { replaceRange(ta, s - 2, s, '—', s - 1); return true; }
  return false;
}

// Position verticale du curseur dans le textarea (miroir hors écran) — pour le
// mode machine à écrire et l'ancrage des suggestions.
const MIRROR_PROPS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth',
  'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
];
export function caretTop(ta) {
  const div = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const p of MIRROR_PROPS) div.style[p] = cs[p];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
  div.textContent = ta.value.slice(0, ta.selectionStart);
  const mark = document.createElement('span');
  mark.textContent = '​';
  div.appendChild(mark);
  document.body.appendChild(div);
  const top = mark.offsetTop;
  div.remove();
  return top;
}

// « [[Nom » en cours de frappe juste avant le curseur → { start, query }.
export function wikiQueryAt(value, caret) {
  const before = value.slice(Math.max(0, caret - 80), caret);
  const i = before.lastIndexOf('[[');
  if (i < 0) return null;
  const q = before.slice(i + 2);
  if (q.includes(']') || q.includes('\n')) return null;
  return { start: caret - before.length + i, query: q };
}
