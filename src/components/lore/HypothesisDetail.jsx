import { useState } from 'react';
import { api } from '../../api/client';
import { CommentsThread } from './CommentsThread';
import { LoreMarkdown } from './markdown';
import {
  ACC, ACC_RGB, CRIMSON, ENTRY_TYPES, INK, MUTED, STANCES, STATUSES,
  STATUS_ORDER, formatDate, hexToRgb, panel,
} from './theme';

// Fiche d'une hypothèse : corps, jauge de confiance, les DEUX colonnes de
// preuves (soutiens / contradictions), transitions de statut — clore en
// confirmed / refuted / abandoned exige la note de résolution, et la note
// reste affichée à vie, même piste rouverte.

const TERMINAL = ['confirmed', 'refuted', 'abandoned'];

export function HypothesisDetail({ hypothesis: h, entries, user, onEdit, onDeleted, onOpenEntry, onChanged }) {
  const [err, setErr] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null); // statut terminal en attente de note
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const meta = STATUSES[h.status] || STATUSES.open;

  const setStatus = async (status, resolutionNote) => {
    setBusy(true); setErr(null);
    try {
      await api.lore.hypotheses.update(h.id, {
        status, ...(resolutionNote !== undefined ? { resolutionNote } : {}),
      });
      setPendingStatus(null);
      onChanged();
    } catch (ex) {
      setErr(ex.message === 'resolution_note_required' ? 'La note de résolution est obligatoire pour clore.' : ex.message);
    } finally { setBusy(false); }
  };

  const clickStatus = (status) => {
    if (TERMINAL.includes(status)) {
      setPendingStatus(status);
      setNote(h.resolutionNote || '');
    } else {
      setStatus(status);
    }
  };

  const removeHypothesis = async () => {
    // eslint-disable-next-line no-alert -- suppression destructive volontairement bloquante
    if (!window.confirm(`Supprimer l'hypothèse « ${h.title} » ? (Réfuter vaut souvent mieux que supprimer — la trace se garde.)`)) return;
    try {
      await api.lore.hypotheses.remove(h.id);
      onDeleted();
    } catch (ex) { setErr(ex.message); }
  };

  const supports = h.evidence.filter((e) => e.stance === 'supports');
  const contradicts = h.evidence.filter((e) => e.stance === 'contradicts');
  const neutral = h.evidence.filter((e) => e.stance === 'neutral');

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {err && <p style={{ color: CRIMSON, fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 24, lineHeight: 1.2 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.4px' }}>
            {h.title}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <span style={{
              padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
              color: meta.color, background: `rgba(${hexToRgb(meta.color)},0.13)`,
              border: `1px solid rgba(${hexToRgb(meta.color)},0.5)`,
            }}>{meta.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: MUTED }}>
              confiance {h.confidence} % · ✔ {supports.length} / ✘ {contradicts.length}
              {h.authorName ? ` · ${h.authorName}` : ''}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(120,110,140,0.25)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${h.confidence}%`, height: '100%', background: meta.color }} />
          </div>
        </div>
      </div>

      {h.bodyMd && (
        <div style={{ marginTop: 14 }}>
          <LoreMarkdown content={h.bodyMd} entries={entries} onOpenEntry={onOpenEntry} />
        </div>
      )}

      {/* note de résolution — la trace, jamais masquée */}
      {h.resolutionNote && (
        <div style={{
          ...panel, borderColor: `rgba(${hexToRgb(meta.color)},0.35)`, padding: '10px 13px', margin: '12px 0',
        }}>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 3 }}>
            📌 Note de résolution{h.resolvedAt ? ` — ${formatDate(h.resolvedAt)}` : ' (piste rouverte depuis)'}
          </div>
          <div style={{ fontSize: 13.5, color: 'rgba(214,206,230,0.92)' }}>{h.resolutionNote}</div>
        </div>
      )}

      {/* transitions de statut */}
      <div style={{ margin: '14px 0' }}>
        <SectionTitle>Statut</SectionTitle>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUS_ORDER.filter((s) => s !== h.status).map((s) => {
            const m = STATUSES[s];
            return (
              <button key={s} type="button" disabled={busy} onClick={() => clickStatus(s)} style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                color: m.color, background: pendingStatus === s ? `rgba(${hexToRgb(m.color)},0.2)` : 'transparent',
                border: `1px solid rgba(${hexToRgb(m.color)},0.5)`,
              }}>{m.icon} {m.label}</button>
            );
          })}
        </div>
        {pendingStatus && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
              Note de résolution (obligatoire pour « {STATUSES[pendingStatus].label} ») —
              pourquoi cette piste se ferme ?
            </div>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Ex. : 256 combinaisons testées, aucun effet ; support décoratif d'End rods."
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, fontSize: 13.5,
                fontFamily: "'Inter',sans-serif", background: 'rgba(9,16,14,0.7)',
                border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" disabled={busy || !note.trim()} onClick={() => setStatus(pendingStatus, note.trim())} style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: STATUSES[pendingStatus].color, color: '#0b0d06', border: 'none',
                opacity: busy || !note.trim() ? 0.5 : 1,
              }}>{STATUSES[pendingStatus].icon} Clore en « {STATUSES[pendingStatus].label} »</button>
              <button type="button" onClick={() => setPendingStatus(null)}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12.5 }}>annuler</button>
            </div>
          </div>
        )}
      </div>

      {/* preuves : deux colonnes */}
      <SectionTitle>🧪 Preuves ({h.evidence.length})</SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <EvidenceColumn title={`✔ Soutiens (${supports.length})`} color={ACC} items={supports}
          onOpenEntry={onOpenEntry} onChanged={onChanged} setErr={setErr} />
        <EvidenceColumn title={`✘ Contradictions (${contradicts.length})`} color={CRIMSON} items={contradicts}
          onOpenEntry={onOpenEntry} onChanged={onChanged} setErr={setErr} />
      </div>
      {neutral.length > 0 && (
        <EvidenceColumn title={`• Neutres (${neutral.length})`} color="#b9aecb" items={neutral}
          onOpenEntry={onOpenEntry} onChanged={onChanged} setErr={setErr} />
      )}
      <AddEvidence hypothesis={h} entries={entries} onChanged={onChanged} setErr={setErr} />

      {/* médias */}
      {(h.media.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
          {h.media.map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" title={m.caption || m.originalName}>
              <img src={m.thumbUrl || m.url} alt={m.caption || m.originalName}
                style={{ height: 80, borderRadius: 8, border: '1px solid rgba(60,130,90,0.3)', display: 'block' }} />
            </a>
          ))}
        </div>
      )}
      <label style={{ display: 'inline-block', margin: '6px 0 4px', fontSize: 12, color: ACC, cursor: 'pointer', textDecoration: 'underline' }}>
        🖼 Joindre une image
        <input
          type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
              const fd = new FormData();
              fd.append('image', file);
              fd.append('hypothesisId', String(h.id));
              await api.lore.media.upload(fd);
              onChanged();
            } catch (ex) { setErr(ex.message === 'not_an_image' ? 'Fichier illisible comme image.' : ex.message); }
          }}
        />
      </label>

      <div style={{ borderTop: '1px solid rgba(60,130,90,0.2)', margin: '14px 0', paddingTop: 14 }}>
        <CommentsThread targetType="lore_hypothesis" targetId={h.id} user={user} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={removeHypothesis} style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          background: 'transparent', color: CRIMSON, border: '1px solid rgba(224,82,111,0.5)',
        }}>Supprimer</button>
        <button type="button" onClick={onEdit} style={{
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none',
        }}>✎ Modifier</button>
      </div>
    </div>
  );
}

function EvidenceColumn({ title, color, items, onOpenEntry, onChanged, setErr }) {
  const remove = async (id) => {
    try { await api.lore.evidence.remove(id); onChanged(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <div style={{ flex: '1 1 240px', minWidth: 220 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color, marginBottom: 6 }}>{title}</div>
      {items.length === 0 && <p style={{ color: MUTED, fontSize: 12, opacity: 0.7, margin: 0 }}>—</p>}
      {items.map((ev) => {
        const t = ENTRY_TYPES[ev.entry.entryType] || ENTRY_TYPES.observation;
        return (
          <div key={ev.id} style={{
            ...panel, borderColor: `rgba(${hexToRgb(color)},0.25)`,
            padding: '8px 10px', marginBottom: 6, fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <button type="button" onClick={() => onOpenEntry(ev.entry.id)} style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                color: INK, font: 'inherit', fontWeight: 600, flex: 1,
              }}>{t.icon} {ev.entry.title}</button>
              <button type="button" onClick={() => remove(ev.id)} title="Retirer cette preuve"
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
            {ev.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{ev.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

// Relier une entrée existante — une même observation peut soutenir ici et
// contredire ailleurs, mais une seule position par (hypothèse, entrée).
function AddEvidence({ hypothesis, entries, onChanged, setErr }) {
  const [entryId, setEntryId] = useState('');
  const [stance, setStance] = useState('supports');
  const [note, setNote] = useState('');
  const linked = new Set(hypothesis.evidence.map((e) => e.entry.id));
  const candidates = entries.filter((e) => !linked.has(e.id));

  const add = async () => {
    if (!entryId) return;
    try {
      await api.lore.hypotheses.addEvidence(hypothesis.id, { entryId: Number(entryId), stance, note: note.trim() });
      setEntryId(''); setNote('');
      onChanged();
    } catch (ex) {
      setErr(ex.message === 'evidence_exists' ? 'Cette entrée est déjà liée à l\'hypothèse.' : ex.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '8px 0 4px' }}>
      <select value={stance} onChange={(e) => setStance(e.target.value)} style={sel}>
        {Object.entries(STANCES).map(([k, s]) => <option key={k} value={k}>{s.icon} {s.label}</option>)}
      </select>
      <select value={entryId} onChange={(e) => setEntryId(e.target.value)} style={{ ...sel, flex: 1, minWidth: 170 }}>
        <option value="">— choisir une entrée —</option>
        {candidates.map((e) => (
          <option key={e.id} value={e.id}>{ENTRY_TYPES[e.entryType]?.icon} {e.title}</option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optionnelle)"
        style={{ ...sel, flex: 1, minWidth: 140 }} />
      <button type="button" onClick={add} disabled={!entryId} style={{
        padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
        background: `rgba(${ACC_RGB},0.15)`, color: ACC, border: `1px solid rgba(${ACC_RGB},0.5)`,
        opacity: entryId ? 1 : 0.5,
      }}>+ Relier</button>
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

const sel = {
  padding: '6px 9px', borderRadius: 7, fontFamily: "'Inter',sans-serif", fontSize: 12,
  background: 'rgba(9,16,14,0.85)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
};
