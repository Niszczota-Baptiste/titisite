import { useEffect, useState } from 'react';
import { formatCoords } from './coords';
import {
  ACC, ACC_RGB, DIMENSIONS, ENTRY_TYPES, ENTRY_TYPE_ORDER, INK, MONDES,
  MONDE_ORDER, MUTED, formatDay, hexToRgb, panel,
} from './theme';

// Liste + filtres combinés (type, monde, dimension, tag, plein-texte). Le
// filtrage est fait côté serveur — la liste ne fait que refléter `filters`.

export function EntryList({ entries, tags, filters, setFilters, onOpen, onCreate }) {
  // La recherche est débouncée localement pour ne pas mitrailler le serveur.
  const [q, setQ] = useState(filters.q || '');
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === (q || undefined) ? f : { ...f, q: q || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, setFilters]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value || undefined }));

  return (
    <div>
      {/* barre de filtres */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Rechercher (titres + corps)…"
          style={{
            flex: '1 1 220px', minWidth: 180, padding: '9px 12px', borderRadius: 8,
            fontFamily: "'Inter',sans-serif", fontSize: 13.5,
            background: 'rgba(9,16,14,0.7)', border: `1px solid rgba(${ACC_RGB},0.25)`, color: INK, outline: 'none',
          }}
        />
        <Select value={filters.type || ''} onChange={(v) => set('type', v)}>
          <option value="">Tous types</option>
          {ENTRY_TYPE_ORDER.map((t) => <option key={t} value={t}>{ENTRY_TYPES[t].icon} {ENTRY_TYPES[t].label}</option>)}
        </Select>
        <Select value={filters.dimension || ''} onChange={(v) => set('dimension', v)}>
          <option value="">Toutes dimensions</option>
          {Object.entries(DIMENSIONS).map(([k, d]) => <option key={k} value={k}>{d.icon} {d.label}</option>)}
        </Select>
        <Select value={filters.monde || ''} onChange={(v) => set('monde', v)}>
          <option value="">Tous mondes</option>
          {MONDE_ORDER.map((k) => <option key={k} value={k}>{MONDES[k].icon} {MONDES[k].label}</option>)}
        </Select>
        <Select value={filters.tag || ''} onChange={(v) => set('tag', v)}>
          <option value="">Tous tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.used})</option>)}
        </Select>
        <button type="button" onClick={onCreate} style={{
          marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none',
        }}>+ Nouvelle entrée</button>
      </div>

      <p style={{ color: MUTED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, margin: '0 0 10px' }}>
        {entries.length} entrée{entries.length > 1 ? 's' : ''}
      </p>

      {entries.length === 0 && (
        <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13.5 }}>
          Rien ne correspond à ces filtres.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
        {entries.map((e) => <EntryCard key={e.id} entry={e} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function EntryCard({ entry, onOpen }) {
  const type = ENTRY_TYPES[entry.entryType] || ENTRY_TYPES.observation;
  const hasCoords = entry.x !== null && entry.z !== null;
  return (
    <button
      type="button" onClick={() => onOpen(entry.id)}
      style={{
        ...panel, padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6, color: INK,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{type.icon}</span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14.5, flex: 1 }}>{entry.title}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <Chip color={type.color}>{type.label}</Chip>
        {MONDES[entry.monde] && <Chip color={MONDES[entry.monde].color}>{MONDES[entry.monde].label}</Chip>}
        {entry.dimension !== 'overworld' && <Chip color="#e0913a">{DIMENSIONS[entry.dimension]?.label || entry.dimension}</Chip>}
        {entry.peupleName && <Chip color="#7be3a8">👥 {entry.peupleName}</Chip>}
        {entry.tags.map((t) => <Chip key={t.id} color={t.color}>{t.name}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: MUTED }}>
        <span>{hasCoords ? formatCoords(entry) : '— non localisée —'}</span>
        <span style={{ marginLeft: 'auto' }}>{formatDay(entry.discoveredAt || entry.updatedAt)}</span>
      </div>
    </button>
  );
}

function Chip({ color, children }) {
  return (
    <span style={{
      padding: '1px 8px', borderRadius: 999, fontFamily: "'Inter',sans-serif", fontSize: 10.5,
      fontWeight: 600, color, background: `rgba(${hexToRgb(color)},0.12)`,
      border: `1px solid rgba(${hexToRgb(color)},0.4)`, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '8px 10px', borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13,
        background: 'rgba(9,16,14,0.85)', border: `1px solid rgba(${ACC_RGB},0.25)`, color: INK, outline: 'none',
      }}
    >{children}</select>
  );
}
