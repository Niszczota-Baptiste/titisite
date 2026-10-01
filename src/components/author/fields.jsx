import { useState } from 'react';
import { useAuthor } from './context';
import { CHAPTER_STATUSES, NOTE_STATUSES, PRIORITIES } from './kinds';
import { Markdown } from './markdown';
import { AutoText, Btn, cx } from './ui';

// Champs d'une fiche, pilotés par les définitions de kinds.js. Édition en
// place (à la Notion) : pas de bouton « Enregistrer », l'autosave de
// useEntityDoc s'en charge.

export function FieldInput({ def, doc, setField }) {
  const { categoriesOf, timelines } = useAuthor();
  const value = doc[def.key];
  const set = (v) => setField(def.key, v);
  const id = `f-${def.key}`;

  switch (def.type) {
    case 'text':
      return (
        <>
          <AutoText id={id} value={value} onChange={set} placeholder={def.placeholder || '—'} big={def.big}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} aria-label={def.label} />
          {def.suggestions && (
            <div className="au-suggest">
              {def.suggestions.filter((s) => s !== value).slice(0, 8).map((s) => (
                <button key={s} type="button" className="au-chip" onClick={() => set(s)}>{s}</button>
              ))}
            </div>
          )}
        </>
      );
    case 'area':
      return <AutoText id={id} value={value} onChange={set} rows={def.rows || 2} placeholder="—" aria-label={def.label} />;
    case 'markdown':
      return <MarkdownField id={id} value={value} onChange={set} label={def.label} />;
    case 'number':
      return (
        <input id={id} className="au-inline" type="number" inputMode="decimal" step="any" value={value ?? ''} placeholder="—"
          onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} aria-label={def.label} />
      );
    case 'date':
      return <input id={id} className="au-inline" type="date" value={value || ''} onChange={(e) => set(e.target.value || null)} aria-label={def.label} />;
    case 'select':
      return (
        <select id={id} className="au-select" value={value ?? ''} onChange={(e) => set(Number(e.target.value))} aria-label={def.label}>
          {def.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
    case 'chapterStatus':
      return <StatusSelect id={id} value={value} onChange={set} options={CHAPTER_STATUSES} label={def.label} />;
    case 'noteStatus':
      return <StatusSelect id={id} value={value} onChange={set} options={NOTE_STATUSES} label={def.label} />;
    case 'priority':
      return (
        <div className="au-seg" role="radiogroup" aria-label={def.label}>
          {PRIORITIES.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={value === p.key}
              className={cx(value === p.key && 'is-on')} style={{ '--seg': p.color }} onClick={() => set(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      );
    case 'category': {
      const cats = categoriesOf(def.domain);
      return (
        <select id={id} className="au-select" value={value ?? ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} aria-label={def.label}>
          <option value="">— Aucune —</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      );
    }
    case 'timeline':
      return (
        <select id={id} className="au-select" value={value ?? ''} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} aria-label={def.label}>
          <option value="">— Aucune —</option>
          {timelines.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      );
    default:
      return null;
  }
}

function StatusSelect({ id, value, onChange, options, label }) {
  const cur = options.find((o) => o.key === value) || options[0];
  return (
    <div className="au-status-select" style={{ '--pill': cur.color }}>
      <span className="au-dot" style={{ '--dot': cur.color }} />
      <select id={id} className="au-select" value={value || options[0].key} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Corps Markdown : écriture brute ou aperçu rendu (liens [[Nom]] cliquables).
function MarkdownField({ id, value, onChange, label }) {
  const { pid, resolve } = useAuthor();
  const [preview, setPreview] = useState(false);
  return (
    <div className="au-mdfield">
      <div className="au-mdfield-bar">
        <span className="au-faint" style={{ fontSize: 11.5 }}>Markdown · <code>[[Nom]]</code> relie une fiche</span>
        <Btn size="small" variant="ghost" on={preview} onClick={() => setPreview((p) => !p)}>{preview ? '✎ Écrire' : '👁 Aperçu'}</Btn>
      </div>
      {preview
        ? <div className="au-mdfield-preview" onDoubleClick={() => setPreview(false)}><Markdown content={value} pid={pid} resolve={resolve} /></div>
        : <AutoText id={id} value={value} onChange={onChange} rows={4} placeholder="Écris librement…" className="au-mdfield-text" aria-label={label} />}
    </div>
  );
}
