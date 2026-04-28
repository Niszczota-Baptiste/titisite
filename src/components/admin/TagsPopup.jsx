import { useEffect, useRef, useState } from 'react';
import { Tag } from '../project/shared';
import { ACC, ACC_RGB, Button, inputStyle } from './ui';

export function TagsPopup({ value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    else if (e.key === 'Backspace' && !draft && value.length) removeAt(value.length - 1);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputStyle,
          minHeight: 40, padding: '6px 10px',
          cursor: 'pointer',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          textAlign: 'left',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = ACC)}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(80,50,130,0.24)')}
      >
        {value.length === 0 ? (
          <span style={{
            color: 'rgba(180,170,200,0.5)',
            fontFamily: "'Inter',sans-serif", fontSize: 13,
          }}>
            Aucun tag — cliquer pour ajouter
          </span>
        ) : (
          value.map((t) => <Tag key={t} name={t} />)
        )}
        <span style={{
          marginLeft: 'auto',
          color: 'rgba(180,170,200,0.5)', fontSize: 11,
          fontFamily: "'Inter',sans-serif",
        }}>
          {value.length > 0 ? `${value.length} tag${value.length > 1 ? 's' : ''}` : ''} ▾
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          zIndex: 50,
          background: '#0b0620',
          border: `1px solid rgba(${ACC_RGB},0.3)`,
          borderRadius: 10, padding: 14,
          boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
        }}>
          <div style={{
            fontFamily: "'Inter',sans-serif", fontSize: 11,
            color: 'rgba(180,170,200,0.55)',
            letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700,
            marginBottom: 10,
          }}>
            Gérer les tags
          </div>

          {value.length === 0 ? (
            <p style={{
              color: 'rgba(180,170,200,0.45)',
              fontFamily: "'Inter',sans-serif", fontSize: 12.5,
              marginBottom: 10,
            }}>
              Aucun tag pour le moment.
            </p>
          ) : (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12,
              padding: 8, background: 'rgba(4,3,14,0.45)',
              borderRadius: 6, border: '1px solid rgba(60,40,100,0.2)',
            }}>
              {value.map((t, i) => <Tag key={`${t}-${i}`} name={t} onRemove={() => removeAt(i)} />)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder="Nouveau tag, puis Entrée"
              style={{
                ...inputStyle, flex: 1,
              }}
              onFocus={(e) => (e.target.style.borderColor = ACC)}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(80,50,130,0.24)')}
            />
            <Button type="button" onClick={() => add(draft)} disabled={!draft.trim()}>
              Ajouter
            </Button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
