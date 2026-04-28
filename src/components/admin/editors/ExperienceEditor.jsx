import { ACC, Button, CheckboxField, Field, Input, LocalizedField } from '../ui';
import { ItemList } from '../ItemList';

const EMPTY = () => ({
  company: '',
  role: { fr: '', en: '', ko: '' },
  period: '',
  current: false,
  desc: { fr: '', en: '', ko: '' },
  outcomes: [],
});

export function ExperienceEditor() {
  return (
    <ItemList
      title="Expérience"
      collection="experience"
      emptyDraft={EMPTY}
      renderPreview={(e) => (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 2 }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
              color: '#ede8f8',
            }}>{e.company || '—'}</span>
            <span style={{
              fontFamily: "'Inter',sans-serif", fontSize: 12.5,
              color: 'rgba(180,170,200,0.6)',
            }}>{e.role?.fr || ''}</span>
            {e.current && (
              <span style={{
                fontSize: 10, color: ACC, letterSpacing: '0.5px',
                border: `1px solid ${ACC}55`, padding: '1px 6px', borderRadius: 4,
                marginLeft: 'auto',
              }}>actuel</span>
            )}
          </div>
          <p style={{
            fontFamily: 'monospace', fontSize: 11,
            color: 'rgba(180,170,200,0.5)',
          }}>{e.period}</p>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Entreprise">
              <Input value={d.company} onChange={(e) => set({ ...d, company: e.target.value })} />
            </Field>
            <Field label="Période">
              <Input
                value={d.period}
                onChange={(e) => set({ ...d, period: e.target.value })}
                placeholder="2023 — Présent"
              />
            </Field>
          </div>
          <CheckboxField label="Poste actuel" value={d.current} onChange={(v) => set({ ...d, current: v })} />
          <LocalizedField label="Rôle" value={d.role} onChange={(v) => set({ ...d, role: v })} />
          <LocalizedField label="Description" value={d.desc} onChange={(v) => set({ ...d, desc: v })} multiline />
          <OutcomesField value={d.outcomes} onChange={(v) => set({ ...d, outcomes: v })} />
        </>
      )}
    />
  );
}

function OutcomesField({ value = [], onChange }) {
  const add = () => onChange([...value, { fr: '', en: '', ko: '' }]);
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const setAt = (i, v) => onChange(value.map((o, j) => (j === i ? v : o)));

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <label style={{
          fontFamily: "'Inter',sans-serif", fontSize: 11,
          color: 'rgba(180,170,200,0.7)', letterSpacing: '1px',
          textTransform: 'uppercase', fontWeight: 600,
        }}>Résultats</label>
        <Button variant="ghost" onClick={add} style={{ padding: '4px 10px', fontSize: 11 }}>
          + Ajouter
        </Button>
      </div>
      {value.map((o, i) => (
        <div key={i} style={{
          position: 'relative',
          background: 'rgba(4,3,14,0.4)', borderRadius: 8,
          padding: 12, marginBottom: 8,
          border: '1px solid rgba(60,40,100,0.15)',
        }}>
          <LocalizedField value={o} onChange={(v) => setAt(i, v)} />
          <Button
            variant="danger"
            onClick={() => remove(i)}
            style={{ position: 'absolute', top: 8, right: 8, padding: '3px 10px', fontSize: 11 }}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
