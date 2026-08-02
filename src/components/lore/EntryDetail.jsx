import { useState } from 'react';
import { api } from '../../api/client';
import { formatCoords } from './coords';
import { CommentsThread } from './CommentsThread';
import { LoreMarkdown } from './markdown';
import {
  ACC, ACC_RGB, CRIMSON, DIMENSIONS, ENTRY_TYPES, INK, MUTED, RELATIONS,
  STANCES, STATUSES, formatDate, formatDay, hexToRgb,
} from './theme';

// Fiche complète d'une entrée : corps markdown (liens [[…]] cliquables),
// galerie, relations typées (ajout/suppression), hypothèses où elle sert de
// preuve, historique des révisions, discussion.

export function EntryDetail({ entry, entries, user, onEdit, onDeleted, onOpenEntry, onChanged }) {
  const [err, setErr] = useState(null);
  const type = ENTRY_TYPES[entry.entryType] || ENTRY_TYPES.observation;
  const hasCoords = entry.x !== null && entry.z !== null;

  const removeEntry = async () => {
    // eslint-disable-next-line no-alert -- confirmation destructive volontairement bloquante
    if (!window.confirm(`Supprimer « ${entry.title} » ? Ses preuves, liens, images et commentaires partent avec.`)) return;
    try {
      await api.lore.entries.remove(entry.id);
      onDeleted();
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {err && <p style={{ color: CRIMSON, fontSize: 13 }}>{err}</p>}

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 26, lineHeight: 1.2 }}>{type.icon}</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 21, fontWeight: 800, color: INK, letterSpacing: '-0.4px' }}>
            {entry.title}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Chip color={type.color}>{type.label}</Chip>
            <Chip color={entry.isCanon ? ACC : '#8a80a0'}>
              {entry.isCanon ? '✓ Canon' : 'Interprétation joueur'}
            </Chip>
            <Chip color="#7bd3e8">{DIMENSIONS[entry.dimension]?.icon} {DIMENSIONS[entry.dimension]?.label || entry.dimension}</Chip>
            {entry.tags.map((t) => <Chip key={t.id} color={t.color}>{t.name}</Chip>)}
          </div>
        </div>
      </div>

      {/* meta */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, margin: '12px 0 16px',
        fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: MUTED,
      }}>
        <span>{hasCoords ? `📍 ${formatCoords(entry)}` : '📍 non localisée'}</span>
        {entry.discoveredAt && <span>🔎 découverte le {formatDay(entry.discoveredAt)}</span>}
        {entry.authorName && <span>✍ {entry.authorName}</span>}
        <span>maj {formatDate(entry.updatedAt)}</span>
      </div>

      {entry.bodyMd && (
        <LoreMarkdown content={entry.bodyMd} entries={entries} onOpenEntry={onOpenEntry} />
      )}

      {entry.media.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 16px' }}>
          {entry.media.map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" title={m.caption || m.originalName}>
              <img src={m.thumbUrl || m.url} alt={m.caption || m.originalName}
                style={{ height: 92, borderRadius: 9, border: '1px solid rgba(60,130,90,0.3)', display: 'block' }} />
              {m.caption && <div style={{ fontSize: 10.5, color: MUTED, maxWidth: 140, marginTop: 2 }}>{m.caption}</div>}
            </a>
          ))}
        </div>
      )}

      <RelationsBlock entry={entry} entries={entries} onOpenEntry={onOpenEntry} onChanged={onChanged} setErr={setErr} />

      {entry.evidenceOf.length > 0 && (
        <SectionTitle>🧪 Sert de preuve</SectionTitle>
      )}
      {entry.evidenceOf.map((ev) => {
        const stance = STANCES[ev.stance] || STANCES.neutral;
        const status = STATUSES[ev.status] || STATUSES.open;
        return (
          <div key={ev.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: stance.color, fontWeight: 700 }}>{stance.icon} {stance.label}</span>
            <span style={{ color: INK }}>{ev.title}</span>
            <Chip color={status.color}>{status.icon} {status.label}</Chip>
            {ev.note && <span style={{ color: MUTED, fontSize: 12 }}>— {ev.note}</span>}
          </div>
        );
      })}

      <RevisionsBlock entryId={entry.id} />

      <div style={{ borderTop: '1px solid rgba(60,130,90,0.2)', margin: '16px 0', paddingTop: 14 }}>
        <CommentsThread targetType="lore_entry" targetId={entry.id} user={user} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={removeEntry} style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          background: 'transparent', color: CRIMSON, border: `1px solid rgba(224,82,111,0.5)`,
        }}>Supprimer</button>
        <button type="button" onClick={onEdit} style={{
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none',
        }}>✎ Modifier</button>
      </div>
    </div>
  );
}

// Relations typées (lore_links) — sortantes et entrantes, plus le petit
// formulaire d'ajout. Les liens [[…]] du corps sont une autre chose : du
// texte ; ici ce sont des arêtes du graphe.
function RelationsBlock({ entry, entries, onOpenEntry, onChanged, setErr }) {
  const [relationType, setRelationType] = useState('points_to');
  const [targetId, setTargetId] = useState('');

  const addLink = async () => {
    if (!targetId) return;
    try {
      await api.lore.links.create({ fromEntryId: entry.id, toEntryId: Number(targetId), relationType });
      setTargetId('');
      onChanged();
    } catch (ex) {
      setErr(ex.message === 'link_exists' ? 'Cette relation existe déjà.' : ex.message);
    }
  };

  const removeLink = async (id) => {
    try { await api.lore.links.remove(id); onChanged(); } catch (ex) { setErr(ex.message); }
  };

  const others = entries.filter((e) => e.id !== entry.id);

  return (
    <div style={{ margin: '4px 0 14px' }}>
      <SectionTitle>🔗 Relations</SectionTitle>
      {entry.linksOut.length + entry.linksIn.length === 0 && (
        <p style={{ color: MUTED, fontSize: 12.5, margin: '2px 0 8px' }}>Aucune relation pour l'instant.</p>
      )}
      {entry.linksOut.map((l) => (
        <LinkRow key={`o${l.id}`} label={RELATIONS[l.relationType]?.label || l.relationType} link={l}
          onOpen={() => onOpenEntry(l.entryId)} onRemove={() => removeLink(l.id)} />
      ))}
      {entry.linksIn.map((l) => (
        <LinkRow key={`i${l.id}`} label={RELATIONS[l.relationType]?.reverse || l.relationType} link={l} incoming
          onOpen={() => onOpenEntry(l.entryId)} onRemove={() => removeLink(l.id)} />
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        <select value={relationType} onChange={(e) => setRelationType(e.target.value)} style={miniSelect}>
          {Object.entries(RELATIONS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ ...miniSelect, flex: 1, minWidth: 160 }}>
          <option value="">— choisir une entrée —</option>
          {others.map((e) => <option key={e.id} value={e.id}>{ENTRY_TYPES[e.entryType]?.icon} {e.title}</option>)}
        </select>
        <button type="button" onClick={addLink} disabled={!targetId} style={{
          padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
          background: `rgba(${ACC_RGB},0.15)`, color: ACC, border: `1px solid rgba(${ACC_RGB},0.5)`,
          opacity: targetId ? 1 : 0.5,
        }}>+ Relier</button>
      </div>
    </div>
  );
}

function LinkRow({ label, link, incoming = false, onOpen, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: MUTED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{incoming ? '←' : '→'}</span>
      <span style={{ color: MUTED, fontSize: 12 }}>{label}</span>
      <button type="button" onClick={onOpen} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
        color: ACC, borderBottom: `1px solid ${ACC}55`,
      }}>{ENTRY_TYPES[link.entryType]?.icon} {link.title}</button>
      {link.note && <span style={{ color: MUTED, fontSize: 11.5 }}>— {link.note}</span>}
      <button type="button" onClick={onRemove} title="Supprimer la relation"
        style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 11 }}>✕</button>
    </div>
  );
}

// Historique des révisions du corps — chargé à la demande, jamais bloquant.
function RevisionsBlock({ entryId }) {
  const [revisions, setRevisions] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = () => {
    api.lore.entries.revisions(entryId).then(setRevisions).catch(() => setRevisions([]));
  };

  if (revisions === null) {
    return (
      <button type="button" onClick={load} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: MUTED, fontSize: 12, textDecoration: 'underline', marginBottom: 10,
      }}>🕰 Voir l'historique des versions</button>
    );
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <SectionTitle>🕰 Historique ({revisions.length})</SectionTitle>
      {revisions.map((r) => (
        <div key={r.id} style={{ marginBottom: 4 }}>
          <button type="button" onClick={() => setOpenId((o) => (o === r.id ? null : r.id))} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: openId === r.id ? ACC : MUTED, fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
          }}>
            {openId === r.id ? '▾' : '▸'} {formatDate(r.createdAt)} {r.authorName ? `— ${r.authorName}` : ''}
          </button>
          {openId === r.id && (
            <pre style={{
              whiteSpace: 'pre-wrap', fontFamily: "'Inter',sans-serif", fontSize: 12.5,
              color: 'rgba(200,192,216,0.85)', background: 'rgba(9,16,14,0.55)',
              border: '1px solid rgba(60,130,90,0.18)', borderRadius: 8, padding: '8px 10px', margin: '4px 0 0',
            }}>{r.bodyMd || '(corps vide)'}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: INK, margin: '10px 0 6px' }}>
      {children}
    </div>
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

const miniSelect = {
  padding: '6px 9px', borderRadius: 7, fontFamily: "'Inter',sans-serif", fontSize: 12,
  background: 'rgba(9,16,14,0.85)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
};
