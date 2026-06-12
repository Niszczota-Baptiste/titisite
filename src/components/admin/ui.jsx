export const ACC = '#c9a8e8';
export const ACC_RGB = '201,168,232';

export const box = {
  background: 'rgba(14,9,28,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 12,
  padding: 20,
};

export const label = {
  display: 'block',
  fontFamily: "'Inter',sans-serif",
  fontSize: 11,
  color: 'rgba(180,170,200,0.7)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: 6,
  fontWeight: 600,
};

export const inputStyle = {
  width: '100%',
  background: 'rgba(14,8,32,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#ede8f8',
  fontFamily: "'Inter',sans-serif",
  fontSize: 13.5,
  outline: 'none',
  resize: 'vertical',
  transition: 'border-color 0.15s',
};

export function Field({ label: lbl, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {lbl && <label style={label}>{lbl}</label>}
      {children}
    </div>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      onFocus={(e) => (e.target.style.borderColor = ACC)}
      onBlur={(e) => (e.target.style.borderColor = 'rgba(80,50,130,0.24)')}
    />
  );
}

export function Textarea(props) {
  return (
    <textarea
      rows={3}
      {...props}
      style={{ ...inputStyle, minHeight: 80, ...(props.style || {}) }}
      onFocus={(e) => (e.target.style.borderColor = ACC)}
      onBlur={(e) => (e.target.style.borderColor = 'rgba(80,50,130,0.24)')}
    />
  );
}

export function Button({ variant = 'primary', children, style, ...rest }) {
  const base = {
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.18s',
  };
  const variants = {
    primary: { background: ACC, color: '#08051a' },
    ghost: {
      background: 'transparent',
      color: 'rgba(232,228,248,0.75)',
      border: '1px solid rgba(80,50,130,0.32)',
    },
    danger: {
      background: 'transparent',
      color: '#ff8a9b',
      border: '1px solid rgba(255,100,120,0.35)',
    },
  };
  return (
    <button type="button" {...rest} style={{ ...base, ...variants[variant], ...(style || {}) }}>
      {children}
    </button>
  );
}

export function LocalizedField({ label: lbl, value = {}, onChange, multiline = false }) {
  const Comp = multiline ? Textarea : Input;
  return (
    <Field label={lbl}>
      <div style={{ display: 'grid', gap: 6 }}>
        {['fr', 'en', 'ko'].map((l) => (
          <div key={l} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8, alignItems: 'start' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: 10, color: ACC,
              padding: '6px 0', letterSpacing: '1px',
            }}>
              {l.toUpperCase()}
            </span>
            <Comp
              value={value[l] || ''}
              onChange={(e) => onChange({ ...value, [l]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </Field>
  );
}

export function TagsField({ label: lbl, value = [], onChange }) {
  const str = Array.isArray(value) ? value.join(', ') : '';
  return (
    <Field label={lbl}>
      <Input
        value={str}
        onChange={(e) =>
          onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
        }
        placeholder="Séparés par des virgules"
      />
    </Field>
  );
}

export function CheckboxField({ label: lbl, value, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13,
      color: '#ede8f8',
    }}>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: ACC, width: 16, height: 16 }}
      />
      {lbl}
    </label>
  );
}

// Inline banner offering to restore a localStorage draft that is newer than
// the server copy (see src/hooks/useDraft.js). `draft` is `{ value, ts }`.
export function DraftBanner({ draft, onRestore, onDiscard }) {
  if (!draft) return null;
  const mins = Math.max(1, Math.round((Date.now() - draft.ts) / 60000));
  const age = mins < 60 ? `il y a ${mins} min` : `il y a ${Math.round(mins / 60)} h`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: `rgba(${ACC_RGB},0.08)`, border: `1px solid rgba(${ACC_RGB},0.32)`,
      borderRadius: 8, padding: '8px 12px', marginBottom: 12,
      fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(232,228,248,0.85)',
    }}>
      <span>📝 Brouillon non enregistré trouvé ({age}).</span>
      <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <Button type="button" onClick={onRestore} style={{ padding: '5px 12px', fontSize: 12 }}>
          Restaurer le brouillon
        </Button>
        <Button type="button" variant="ghost" onClick={onDiscard} style={{ padding: '5px 12px', fontSize: 12 }}>
          Ignorer
        </Button>
      </span>
    </div>
  );
}
