import { Fragment } from 'react';
import { ACC } from './theme';

// Markdown → éléments React pour le module Lore. Même philosophie que le
// renderer maison de l'espace écriture (src/components/writing/markdown.jsx) :
// AUCUN HTML brut, chaque nœud est un élément React donc tout texte est
// échappé — pas de surface d'injection, pas de dépendance. Sous-ensemble :
//   #/##/### titres, - / * / 1. listes, > citation, --- règle,
//   **gras**, *italique*, `code`, [label](url) (http/https/relatif),
//   et le token du module : [[Titre d'entrée]] / [[Titre|Label]], résolu
//   contre la liste des entrées (par titre OU par slug, insensible à la casse).

const INLINE_SRC = [
  '\\[\\[([^\\]|]+?)(?:\\|([^\\]]+?))?\\]\\]', // [[Titre|Label]]
  '\\*\\*([^*]+?)\\*\\*',
  '\\*([^*]+?)\\*',
  '`([^`]+?)`',
  '\\[([^\\]]+?)\\]\\(([^)\\s]+?)\\)',
].join('|');

function safeHref(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  return null;
}

// Lien interne [[…]] : bouton stylé lien si l'entrée existe, pointillé sinon
// (le titre a pu changer — le texte reste lisible, jamais cassé). En mode
// print (dossier imprimable) : simple texte souligné, rien d'interactif.
function EntryToken({ target, label, entry, accent, onOpenEntry, print }) {
  if (print) {
    return <span style={{ fontWeight: 600, textDecoration: 'underline' }}>{label}</span>;
  }
  if (!entry) {
    return (
      <span
        title={`Entrée introuvable : « ${target} »`}
        style={{ borderBottom: '1px dashed rgba(224,82,111,0.7)', cursor: 'help' }}
      >{label}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpenEntry?.(entry.id)}
      title={entry.title}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', color: accent, borderBottom: `1px solid ${accent}55`,
      }}
    >{label}</button>
  );
}

function parseInline(text, ctx, keyPrefix) {
  const nodes = [];
  let last = 0;
  let m;
  let i = 0;
  // eslint-disable-next-line security/detect-non-literal-regexp -- INLINE_SRC est une constante du module, pas une entrée utilisateur
  const re = new RegExp(INLINE_SRC, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-i${i++}`;
    const [, entryTitle, entryLabel, bold, italic, code, linkLabel, linkUrl] = m;

    if (entryTitle !== undefined) {
      const wanted = entryTitle.trim().toLowerCase();
      const entry = ctx.entries?.find(
        (e) => e.title.toLowerCase() === wanted || e.slug === wanted,
      ) || null;
      nodes.push(
        <EntryToken
          key={key} target={entryTitle.trim()} label={(entryLabel || entryTitle).trim()}
          entry={entry} accent={ctx.accent || ACC} onOpenEntry={ctx.onOpenEntry}
          print={ctx.print}
        />,
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={key} style={{ color: ctx.print ? 'inherit' : '#ede8f8', fontWeight: 700 }}>{parseInline(bold, ctx, key)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{parseInline(italic, ctx, key)}</em>);
    } else if (code !== undefined) {
      nodes.push(
        <code key={key} style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: '0.88em',
          background: ctx.print ? 'rgba(0,0,0,0.06)' : 'rgba(123,227,168,0.1)',
          padding: '1px 5px', borderRadius: 4,
        }}>{code}</code>,
      );
    } else if (linkLabel !== undefined) {
      const href = safeHref(linkUrl);
      nodes.push(href
        ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: ctx.print ? 'inherit' : (ctx.accent || ACC), textDecoration: 'underline' }}>{linkLabel}</a>
        )
        : linkLabel);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderLoreMarkdown(content, ctx = {}) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const pushList = (ordered) => {
    const items = [];
    const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
    while (i < lines.length && re.test(lines[i])) {
      items.push(lines[i].match(re)[1]);
      i += 1;
    }
    const key = `b${blocks.length}`;
    const Tag = ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={key} style={{ margin: '0 0 16px', paddingLeft: 24, lineHeight: 1.75 }}>
        {items.map((it, j) => <li key={j} style={{ marginBottom: 3 }}>{parseInline(it, ctx, `${key}-${j}`)}</li>)}
      </Tag>,
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`b${blocks.length}`} style={{ border: 'none', borderTop: ctx.print ? '1px solid rgba(0,0,0,0.25)' : '1px solid rgba(60,130,90,0.3)', margin: '22px 0' }} />);
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const size = [22, 19, 17, 16, 15, 14][h[1].length - 1];
      const key = `b${blocks.length}`;
      blocks.push(
        <p key={key} style={{
          fontFamily: ctx.print ? 'inherit' : "'Space Grotesk',sans-serif", fontWeight: 700,
          fontSize: size, color: ctx.print ? 'inherit' : '#ede8f8', margin: '6px 0 12px', letterSpacing: '-0.3px',
        }}>{parseInline(h[2], ctx, key)}</p>,
      );
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const key = `b${blocks.length}`;
      blocks.push(
        <blockquote key={key} style={{
          borderLeft: ctx.print ? '3px solid rgba(0,0,0,0.3)' : '3px solid rgba(123,227,168,0.4)',
          paddingLeft: 14, margin: '0 0 16px',
          color: ctx.print ? 'inherit' : 'rgba(200,192,216,0.85)', fontStyle: 'italic', lineHeight: 1.7,
        }}>{buf.map((b, j) => <Fragment key={j}>{parseInline(b, ctx, `${key}-${j}`)}{j < buf.length - 1 && <br />}</Fragment>)}</blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) { pushList(false); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { pushList(true); continue; }

    const buf = [];
    while (
      i < lines.length && lines[i].trim() !== ''
      && !/^\s*(#{1,6}\s|>\s?|[-*]\s+|\d+\.\s+|---+\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    const key = `b${blocks.length}`;
    blocks.push(
      <p key={key} style={{ margin: '0 0 16px', lineHeight: 1.75 }}>
        {buf.map((b, j) => <Fragment key={j}>{parseInline(b, ctx, `${key}-${j}`)}{j < buf.length - 1 && <br />}</Fragment>)}
      </p>,
    );
  }
  return blocks;
}

export function LoreMarkdown({ content, entries = [], onOpenEntry, accent = ACC, print = false, style }) {
  return (
    <div style={print
      ? { fontSize: 13.5, color: 'inherit', ...style }
      : { fontFamily: "'Inter',sans-serif", fontSize: 14.5, color: 'rgba(214,206,230,0.92)', ...style }}
    >
      {renderLoreMarkdown(content, { entries, onOpenEntry, accent, print })}
    </div>
  );
}
