import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { LoreMarkdown } from './markdown';
import {
  ACC, ACC_RGB, INK, MUTED, STATUSES, STATUS_ORDER, formatDay, hexToRgb, panel,
} from './theme';

// Tableau de bord des hypothèses : colonnes par statut (kanban léger). Les
// pistes mortes (réfutées / abandonnées) ne sont JAMAIS supprimées — elles
// sont juste repliées par défaut, un clic les rouvre avec leur note de
// résolution. C'est le contrat épistémique du module.

const LIVE_STATUSES = ['open', 'testing', 'confirmed'];
const DEAD_STATUSES = ['refuted', 'abandoned'];

export function HypothesesTab({ onOpen, onCreate, refreshKey = 0 }) {
  const [hypotheses, setHypotheses] = useState(null);
  const [showDead, setShowDead] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.lore.hypotheses.list()
      .then((h) => { if (alive) setHypotheses(h); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (hypotheses === null) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err || 'Chargement…'}</p>;
  }

  const deadCount = hypotheses.filter((h) => DEAD_STATUSES.includes(h.status)).length;
  const columns = [...LIVE_STATUSES, ...(showDead ? DEAD_STATUSES : [])]
    .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));

  return (
    <div>
      {err && <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <button type="button" onClick={onCreate} style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
          fontSize: 13, fontWeight: 700, background: ACC, color: '#08130b', border: 'none',
        }}>+ Nouvelle hypothèse</button>
        <button
          type="button" onClick={() => setShowDead((v) => !v)}
          title="Les pistes réfutées ou abandonnées restent consultables avec leur note de résolution"
          style={{
            padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
            fontSize: 12.5, fontWeight: 600,
            color: showDead ? '#b9aecb' : MUTED, background: showDead ? 'rgba(138,128,160,0.14)' : 'transparent',
            border: `1px solid rgba(138,128,160,${showDead ? 0.55 : 0.3})`,
          }}
        >🪦 {showDead ? 'Masquer' : 'Voir'} les pistes mortes ({deadCount})</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map((status) => {
          const meta = STATUSES[status];
          const items = hypotheses.filter((h) => h.status === status);
          return (
            <div key={status} style={{ flex: '1 1 230px', minWidth: 225 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8,
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5, color: meta.color,
              }}>
                {meta.icon} {meta.label}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: MUTED }}>({items.length})</span>
              </div>
              {items.length === 0 && (
                <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 12, opacity: 0.7 }}>—</p>
              )}
              {items.map((h) => <HypothesisCard key={h.id} h={h} onOpen={onOpen} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HypothesisCard({ h, onOpen }) {
  const meta = STATUSES[h.status];
  return (
    <button
      type="button" onClick={() => onOpen(h.id)}
      style={{
        ...panel, borderColor: `rgba(${hexToRgb(meta.color)},0.3)`,
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '11px 12px', marginBottom: 8, color: INK, fontFamily: "'Inter',sans-serif",
      }}
    >
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5, lineHeight: 1.35 }}>
        {h.title}
      </div>
      {/* jauge de confiance 0-100 */}
      <div title={`Confiance : ${h.confidence} %`} style={{
        height: 4, borderRadius: 2, background: 'rgba(120,110,140,0.25)', margin: '8px 0 7px', overflow: 'hidden',
      }}>
        <div style={{ width: `${h.confidence}%`, height: '100%', background: meta.color, borderRadius: 2 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 11.5 }}>
        <span style={{ color: ACC }}>✔ {h.supportsCount}</span>
        <span style={{ color: '#e0526f' }}>✘ {h.contradictsCount}</span>
        <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: MUTED }}>
          {h.resolvedAt ? formatDay(h.resolvedAt) : `${h.confidence} %`}
        </span>
      </div>
    </button>
  );
}

// Éditeur (création + titre/corps/confiance d'une hypothèse existante). Les
// changements de STATUT passent par la fiche — c'est là que la note de
// résolution est exigée.
export function HypothesisEditor({ hypothesis, entries, onSaved, onCancel }) {
  const [title, setTitle] = useState(hypothesis?.title || '');
  const [bodyMd, setBodyMd] = useState(hypothesis?.bodyMd || '');
  const [confidence, setConfidence] = useState(hypothesis?.confidence ?? 50);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setErr(null);
    try {
      const payload = { title: title.trim(), bodyMd, confidence: Number(confidence) };
      const saved = hypothesis
        ? await api.lore.hypotheses.update(hypothesis.id, payload)
        : await api.lore.hypotheses.create(payload);
      onSaved(saved.id);
    } catch (ex) { setErr(ex.message); setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={{ fontFamily: "'Inter',sans-serif" }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 13, marginTop: 0 }}>{err}</p>}
      <div style={{ marginBottom: 12 }}>
        <div style={lbl}>Titre</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} style={inp} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={lbl}>Confiance : <strong style={{ color: ACC }}>{confidence} %</strong></div>
        <input type="range" min="0" max="100" step="5" value={confidence}
          onChange={(e) => setConfidence(e.target.value)} style={{ width: '100%', accentColor: ACC }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...lbl, display: 'flex', alignItems: 'center' }}>
          Corps (markdown — <code style={{ fontSize: 11 }}>[[Titre d'entrée]]</code> pour citer une entrée)
          <button type="button" onClick={() => setPreview((p) => !p)} style={{
            marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
            background: preview ? ACC : 'transparent', color: preview ? '#08130b' : ACC,
            border: `1px solid ${ACC}`, fontWeight: 600,
          }}>{preview ? '✎ Éditer' : '👁 Preview'}</button>
        </div>
        {preview ? (
          <div style={{ ...inp, minHeight: 140, maxHeight: 320, overflowY: 'auto' }}>
            <LoreMarkdown content={bodyMd} entries={entries} />
          </div>
        ) : (
          <textarea value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} rows={8}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} disabled={saving} style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: 'transparent', color: MUTED, border: '1px solid rgba(120,110,140,0.4)',
        }}>Annuler</button>
        <button type="submit" disabled={saving || !title.trim()} style={{
          padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none', opacity: saving || !title.trim() ? 0.5 : 1,
        }}>{saving ? 'Enregistrement…' : (hypothesis ? 'Mettre à jour' : 'Créer l\'hypothèse')}</button>
      </div>
    </form>
  );
}

const lbl = { fontSize: 12, color: MUTED, marginBottom: 4 };
const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  fontFamily: "'Inter',sans-serif", fontSize: 13.5,
  background: 'rgba(9,16,14,0.7)', border: `1px solid rgba(${ACC_RGB},0.25)`, color: INK, outline: 'none',
};
