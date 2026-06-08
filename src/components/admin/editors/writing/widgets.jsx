import { useRef, useState } from 'react';
import { ACC, ACC_RGB, Field } from '../../ui';

export const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)',
  border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '10px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};

export const removeBtn = {
  background: 'none', border: '1px solid rgba(255,100,120,0.25)', borderRadius: 6,
  color: 'rgba(255,120,140,0.7)', cursor: 'pointer', padding: '0 8px',
  fontFamily: "'Inter',sans-serif", fontSize: 16, lineHeight: '36px', flexShrink: 0,
};

export const addBtn = {
  background: 'rgba(80,50,130,0.12)', border: '1px dashed rgba(80,50,130,0.35)',
  borderRadius: 8, color: `rgba(${ACC_RGB},0.8)`,
  cursor: 'pointer', padding: '7px 14px', width: '100%',
  fontFamily: "'Inter',sans-serif", fontSize: 12, marginTop: 6,
};

export const blockStyle = {
  background: 'rgba(80,50,130,0.07)', border: '1px solid rgba(80,50,130,0.18)',
  borderRadius: 10, padding: '14px 16px', marginBottom: 14,
};

export const blockLabel = {
  fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700,
  color: `rgba(${ACC_RGB},0.75)`, letterSpacing: '1px', textTransform: 'uppercase',
  marginBottom: 12, display: 'block',
};

export function SelectField({ label, value, onChange, options, allowEmpty }) {
  return (
    <Field label={label}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {allowEmpty && <option value="">{allowEmpty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

// Move an item within a list (immutable). Used by the drag-and-drop lists.
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

// Markdown textarea with an insertion toolbar for the custom tokens
// ([[perso:…]], {{kr:…}}) plus bold/italic/ASCII-box helpers. Inserts at the
// caret so the writer never has to memorise the syntax.
export function MarkdownField({ value, onChange, characters = [], glossary = [], rows = 12, placeholder }) {
  const ref = useRef(null);
  const [menu, setMenu] = useState(null); // 'perso' | 'kr' | null

  const insert = (before, after = '', sample = '') => {
    const el = ref.current;
    const v = value || '';
    const start = el ? el.selectionStart : v.length;
    const end = el ? el.selectionEnd : v.length;
    const selected = v.slice(start, end) || sample;
    const next = v.slice(0, start) + before + selected + after + v.slice(end);
    onChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + before.length + selected.length + after.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const tBtn = {
    background: 'rgba(80,50,130,0.14)', border: '1px solid rgba(80,50,130,0.3)',
    borderRadius: 6, color: 'rgba(232,228,248,0.85)', cursor: 'pointer',
    padding: '4px 10px', fontFamily: "'Inter',sans-serif", fontSize: 12,
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, position: 'relative' }}>
        <button type="button" style={{ ...tBtn, fontWeight: 700 }} onClick={() => insert('**', '**', 'gras')}>B</button>
        <button type="button" style={{ ...tBtn, fontStyle: 'italic' }} onClick={() => insert('*', '*', 'italique')}>I</button>
        <button type="button" style={tBtn} onClick={() => insert('## ', '', 'Titre')}>H</button>
        <button type="button" style={tBtn} onClick={() => insert('> ', '', 'citation')}>❝</button>
        <button type="button" style={tBtn} onClick={() => insert('╔══════════════╗\n║              ║\n╚══════════════╝\n')}>▢ ASCII</button>

        <span style={{ position: 'relative' }}>
          <button type="button" style={{ ...tBtn, color: ACC }} onClick={() => setMenu(menu === 'perso' ? null : 'perso')}>＠ Perso ▾</button>
          {menu === 'perso' && (
            <Dropdown empty="Aucun personnage" items={characters.map((c) => ({ key: c.id, label: `${c.name}${c.role ? ` · ${c.role}` : ''}`, onClick: () => insert(`[[perso:${c.slug}|${c.name}]]`) }))} />
          )}
        </span>
        <span style={{ position: 'relative' }}>
          <button type="button" style={{ ...tBtn, color: ACC }} onClick={() => setMenu(menu === 'kr' ? null : 'kr')}>한 Coréen ▾</button>
          {menu === 'kr' && (
            <Dropdown empty="Lexique vide" items={glossary.map((g) => ({ key: g.id, label: `${g.termKr} — ${g.romanization || ''}`, onClick: () => insert(`{{kr:${g.termKr}}}`) }))} />
          )}
        </span>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', background: 'rgba(8,5,18,0.8)', border: '1px solid rgba(80,50,130,0.28)',
          borderRadius: 8, padding: '12px 14px', color: '#ede8f8', outline: 'none',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 13, lineHeight: 1.7, resize: 'vertical',
        }}
        onFocus={(e) => (e.target.style.borderColor = ACC)}
        onBlur={(e) => (e.target.style.borderColor = 'rgba(80,50,130,0.28)')}
      />
    </div>
  );
}

function Dropdown({ items, empty }) {
  return (
    <div style={{
      position: 'absolute', top: '110%', left: 0, zIndex: 40, minWidth: 200, maxHeight: 240, overflowY: 'auto',
      background: '#0b0620', border: '1px solid rgba(80,50,130,0.4)', borderRadius: 10,
      boxShadow: '0 16px 40px rgba(0,0,0,0.5)', padding: 6,
    }}>
      {items.length === 0 && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.5)', padding: '8px 10px' }}>{empty}</p>}
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={it.onClick}
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
            color: 'rgba(232,228,248,0.85)', cursor: 'pointer', padding: '7px 10px', borderRadius: 6,
            fontFamily: "'Inter',sans-serif", fontSize: 12.5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(80,50,130,0.2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >{it.label}</button>
      ))}
    </div>
  );
}

// "Unsaved changes" pill.
export function DirtyBadge({ dirty }) {
  if (!dirty) return null;
  return (
    <span style={{
      fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#e8a87c',
      background: 'rgba(232,168,124,0.12)', border: '1px solid rgba(232,168,124,0.3)',
      borderRadius: 20, padding: '2px 10px',
    }}>● modifié — non enregistré</span>
  );
}
