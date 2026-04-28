import { useState } from 'react';
import { ACC, Tag, inputStyle } from './shared';

export function TagsInput({ value = [], onChange, placeholder = 'Ajoute un tag, puis Entrée' }) {
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (value.some((t) => t.toLowerCase() === key)) { setDraft(''); return; }
    onChange([...value, v]);
    setDraft('');
  };

  const removeAt = (i) => onChange(value.filter((_, j) => j !== i));

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div style={{
      ...inputStyle,
      padding: 6,
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      cursor: 'text',
    }}
      onClick={(e) => {
        const input = e.currentTarget.querySelector('input');
        input?.focus();
      }}
    >
      {value.map((t, i) => <Tag key={`${t}-${i}`} name={t} onRemove={() => removeAt(i)} />)}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        placeholder={value.length === 0 ? placeholder : ''}
        style={{
          flex: 1, minWidth: 120,
          background: 'transparent', border: 'none', outline: 'none',
          color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13,
          padding: '4px 2px',
        }}
        onFocus={(e) => (e.target.parentElement.style.borderColor = ACC)}
      />
    </div>
  );
}
