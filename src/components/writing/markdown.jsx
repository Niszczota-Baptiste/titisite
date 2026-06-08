import { Fragment } from 'react';
import { CharacterLink, KoreanTerm } from './tokens';

// In-house Markdown subset → React elements. Deliberately NOT a full Markdown
// implementation: it covers what the RP needs and nothing it doesn't, and it
// never produces raw HTML (every node is a React element/string, so React
// escapes all text — no injection surface). Supported:
//   #/##/### headings, - / * / 1. lists, > blockquote, --- rule,
//   **bold**, *italic*, `code`, [label](url) (http/https/relative only),
//   ASCII / box-drawing art preserved verbatim in <pre>,
//   [[perso:slug|Label]] and {{kr:term}} custom tokens.

const ACC = '#c9a8e8';

// Box Drawing (U+2500–U+257F) + Block Elements (U+2580–U+259F).
const BOX_RE = /[─-▟]/;

const INLINE_SRC = [
  '\\[\\[perso:([^\\]|]+?)(?:\\|([^\\]]+?))?\\]\\]', // [[perso:slug|Label]]
  '\\{\\{kr:([^}]+?)\\}\\}',                          // {{kr:term}}
  '\\*\\*([^*]+?)\\*\\*',                              // **bold**
  '\\*([^*]+?)\\*',                                    // *italic*
  '`([^`]+?)`',                                        // `code`
  '\\[([^\\]]+?)\\]\\(([^)\\s]+?)\\)',                 // [label](url)
].join('|');

function safeHref(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  return null;
}

// Parse one line of text into inline React nodes.
function parseInline(text, ctx, keyPrefix) {
  const nodes = [];
  let last = 0;
  let m;
  let i = 0;
  // Fresh regex per call: the recursion (bold/italic re-parse their inner text)
  // would otherwise clobber a shared lastIndex.
  // eslint-disable-next-line security/detect-non-literal-regexp -- INLINE_SRC is a module constant, not user input
  const re = new RegExp(INLINE_SRC, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-i${i++}`;
    const [, personSlug, personLabel, krTerm, bold, italic, code, linkLabel, linkUrl] = m;

    if (personSlug !== undefined) {
      const slug = personSlug.trim().toLowerCase();
      const character = ctx.characters?.find((c) => c.slug === slug) || null;
      const label = (personLabel || character?.name || personSlug).trim();
      nodes.push(
        <CharacterLink key={key} slug={slug} label={label} character={character} accent={ctx.accent} />,
      );
    } else if (krTerm !== undefined) {
      const term = krTerm.trim();
      const entry = ctx.glossary?.find((g) => (g.termKr || '').trim() === term) || null;
      nodes.push(<KoreanTerm key={key} term={term} entry={entry} accent={ctx.accent} />);
    } else if (bold !== undefined) {
      nodes.push(<strong key={key} style={{ color: '#ede8f8', fontWeight: 700 }}>{parseInline(bold, ctx, key)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{parseInline(italic, ctx, key)}</em>);
    } else if (code !== undefined) {
      nodes.push(
        <code key={key} style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: '0.88em',
          background: 'rgba(201,168,232,0.1)', padding: '1px 5px', borderRadius: 4,
        }}>{code}</code>,
      );
    } else if (linkLabel !== undefined) {
      const href = safeHref(linkUrl);
      nodes.push(href
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: ctx.accent || ACC, textDecoration: 'underline' }}>{linkLabel}</a>
        : linkLabel);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Split content into block groups and render each.
export function renderMarkdown(content, ctx = {}) {
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
      <Tag key={key} style={{ margin: '0 0 20px', paddingLeft: 26, lineHeight: 1.9 }}>
        {items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{parseInline(it, ctx, `${key}-${j}`)}</li>)}
      </Tag>,
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i += 1; continue; }

    // ASCII / box-drawing art → verbatim <pre>
    if (BOX_RE.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && BOX_RE.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={`b${blocks.length}`} style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 13, lineHeight: 1.4,
          color: ctx.accent || ACC, margin: '0 0 22px', whiteSpace: 'pre', overflowX: 'auto',
          letterSpacing: 0,
        }}>{buf.join('\n')}</pre>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`b${blocks.length}`} style={{ border: 'none', borderTop: '1px solid rgba(80,50,130,0.3)', margin: '28px 0' }} />);
      i += 1;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const size = [26, 23, 20, 18, 16, 15][level - 1];
      const key = `b${blocks.length}`;
      blocks.push(
        <p key={key} style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
          fontSize: size, color: '#ede8f8', margin: '8px 0 16px', letterSpacing: '-0.3px',
        }}>{parseInline(h[2], ctx, key)}</p>,
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      const key = `b${blocks.length}`;
      blocks.push(
        <blockquote key={key} style={{
          borderLeft: `3px solid rgba(201,168,232,0.4)`, paddingLeft: 18, margin: '0 0 22px',
          color: 'rgba(200,192,216,0.85)', fontStyle: 'italic', lineHeight: 1.85,
        }}>{buf.map((b, j) => <Fragment key={j}>{parseInline(b, ctx, `${key}-${j}`)}{j < buf.length - 1 && <br />}</Fragment>)}</blockquote>,
      );
      continue;
    }

    // Lists
    if (/^\s*[-*]\s+/.test(line)) { pushList(false); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { pushList(true); continue; }

    // Paragraph — gather consecutive plain lines, single newline → <br/>
    const buf = [];
    while (
      i < lines.length && lines[i].trim() !== ''
      && !BOX_RE.test(lines[i])
      && !/^\s*(#{1,6}\s|>\s?|[-*]\s+|\d+\.\s+|---+\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    const key = `b${blocks.length}`;
    blocks.push(
      <p key={key} style={{ margin: '0 0 22px', lineHeight: 1.9 }}>
        {buf.map((b, j) => <Fragment key={j}>{parseInline(b, ctx, `${key}-${j}`)}{j < buf.length - 1 && <br />}</Fragment>)}
      </p>,
    );
  }

  return blocks;
}

// Convenience component.
export function Markdown({ content, characters = [], glossary = [], accent = ACC, style }) {
  return (
    <div style={{
      fontFamily: "'Georgia','Times New Roman',serif",
      fontSize: 17, color: 'rgba(214,206,230,0.92)', ...style,
    }}>
      {renderMarkdown(content, { characters, glossary, accent })}
    </div>
  );
}
