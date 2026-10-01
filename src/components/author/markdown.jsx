import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Rendu Markdown de l'atelier d'auteur — même principe que
// src/components/writing/markdown.jsx : un sous-ensemble maison qui ne produit
// JAMAIS de HTML brut (chaque nœud est un élément React, tout texte est échappé
// par React ; aucun dangerouslySetInnerHTML, aucune dépendance).
//
// Couvre : # titres, **gras**, *italique*, `code`, > citation, listes - / 1.,
// séparateur ---, [lien](https://…) (http/https/relatif seulement), et les
// liens internes à la Obsidian : [[Nom]] ou [[Nom|texte affiché]], résolus par
// titre ou alias vers la fiche correspondante. Un lien non résolu reste
// visible (souligné en pointillés) : on voit ce qui manque à l'univers.
// Couleurs : classes CSS au- (thèmes clair et sombre).

const INLINE_SRC = [
  '\\[\\[([^\\]|]+?)(?:\\|([^\\]]+?))?\\]\\]', // [[Nom|label]]
  '\\*\\*([^*]+?)\\*\\*',                      // **gras**
  '\\*([^*\\s][^*]*?)\\*',                     // *italique*
  '_([^_\\s][^_]*?)_',                         // _italique_
  '`([^`]+?)`',                                // `code`
  '\\[([^\\]]+?)\\]\\(([^)\\s]+?)\\)',         // [label](url)
].join('|');

function safeHref(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//')) || u.startsWith('#')) return u;
  return null;
}

export function normTitle(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function parseInline(text, ctx, keyPrefix) {
  const nodes = [];
  let last = 0;
  let m;
  let i = 0;
  // eslint-disable-next-line security/detect-non-literal-regexp -- INLINE_SRC est une constante du module
  const re = new RegExp(INLINE_SRC, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    const [, wiki, wikiLabel, bold, italic, italic2, code, linkLabel, linkUrl] = m;
    if (wiki !== undefined) {
      const target = ctx.resolve?.(wiki.trim());
      const label = (wikiLabel || wiki).trim();
      nodes.push(target
        ? <Link key={key} to={`/auteur/${ctx.pid}/e/${target.id}`} className="au-wikilink" title={target.title}>{label}</Link>
        : <span key={key} className="au-wikilink is-missing" title="Aucune fiche à ce nom">{label}</span>);
    } else if (bold !== undefined) {
      nodes.push(<strong key={key}>{parseInline(bold, ctx, key)}</strong>);
    } else if (italic !== undefined || italic2 !== undefined) {
      nodes.push(<em key={key}>{parseInline(italic ?? italic2, ctx, key)}</em>);
    } else if (code !== undefined) {
      nodes.push(<code key={key} className="au-md-code">{code}</code>);
    } else if (linkLabel !== undefined) {
      const href = safeHref(linkUrl);
      nodes.push(href
        ? <a key={key} href={href} target={/^https?:/i.test(href) ? '_blank' : undefined} rel="noopener noreferrer">{linkLabel}</a>
        : linkLabel);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START = /^\s*(#{1,6}\s|>\s?|[-*+]\s+|\d+\.\s+|---+\s*$|\*\*\*+\s*$)/;

export function renderMarkdown(content, ctx = {}) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const lines2 = (buf, key) => buf.map((b, j) => <Fragment key={j}>{parseInline(b, ctx, `${key}-${j}`)}{j < buf.length - 1 && <br />}</Fragment>);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }
    const key = `b${blocks.length}`;
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} className="au-md-hr" />);
      i += 1;
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 4);
      const Tag = `h${level + 1}`;
      blocks.push(<Tag key={key} className={`au-md-h au-md-h${level}`}>{parseInline(h[2], ctx, key)}</Tag>);
      i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      blocks.push(<blockquote key={key} className="au-md-quote">{lines2(buf, key)}</blockquote>);
      continue;
    }
    const listRe = /^\s*([-*+]|\d+\.)\s+(.*)$/;
    if (listRe.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && listRe.test(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) {
        items.push(lines[i].match(listRe)[2]);
        i += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={key} className="au-md-list">{items.map((it, j) => <li key={j}>{parseInline(it, ctx, `${key}-${j}`)}</li>)}</Tag>);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && (buf.length === 0 || !BLOCK_START.test(lines[i]))) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={key} className="au-md-p">{lines2(buf, key)}</p>);
  }
  return blocks;
}

export function Markdown({ content, pid, resolve, className, style }) {
  if (!String(content || '').trim()) return <p className="au-faint" style={{ fontStyle: 'italic' }}>Rien d&apos;écrit pour l&apos;instant.</p>;
  return <div className={`au-md ${className || ''}`} style={style}>{renderMarkdown(content, { pid, resolve })}</div>;
}
