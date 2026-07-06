import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../project/shared';
import { useConfirm } from '../../ui/ConfirmProvider';
import { Button, Field, Input, Textarea } from '../admin/ui';
import { QuestWorldMap } from './QuestWorldMap';
import { INK, MUTED, POI_CATEGORIES, POI_CATEGORY_ORDER } from './theme';

const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
  borderRadius: 8, padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};

// « Carte » tab: the aggregated world map + POI editing (for can_edit_quests).
export function MapTab({ canEdit, onOpenQuest }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // poi | { x, z } (new) | null
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.quests.map()); setErr(null); }
    catch (e) { setErr(e.message || 'Erreur'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;
  if (!data) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;

  return (
    <div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.55 }}>
        Tous les points de carte des quêtes réunis sur une grille de coordonnées.
        {canEdit && ' Ajoute aussi des points libres (bâtiments, zones de farm…) avec « + Ajouter un point ».'}
      </p>

      <QuestWorldMap
        questPoints={data.questPoints}
        pois={data.pois}
        canEdit={canEdit}
        onOpenQuest={onOpenQuest}
        onEditPoi={(poi) => setEditing(poi)}
        onAddAt={(x, z) => setEditing({ x, y: 64, z })}
      />

      {/* POI list (quick access / edit) */}
      {data.pois.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
            Points libres ({data.pois.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {data.pois.map((p) => {
              const cat = POI_CATEGORIES[p.category] || POI_CATEGORIES.autre;
              const color = p.couleur || cat.color;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => canEdit && setEditing(p)}
                  style={{
                    textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', padding: '9px 11px',
                    borderRadius: 10, background: 'rgba(14,9,28,0.72)', border: `1px solid rgba(80,50,130,0.24)`,
                    borderLeft: `3px solid ${color}`, color: INK, fontFamily: "'Inter',sans-serif",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{cat.icon} {p.label}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                    {cat.label} · <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>X {p.x} Y {p.y} Z {p.z}</span>
                  </div>
                  {p.note && <div style={{ fontSize: 11.5, color: 'rgba(200,192,216,0.8)', marginTop: 3 }}>{p.note}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier le point' : 'Nouveau point'} width={480}>
        {editing != null && (
          <PoiForm
            poi={editing.id ? editing : null}
            prefill={editing.id ? null : editing}
            onDone={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PoiForm({ poi, prefill, onDone, onCancel }) {
  const confirm = useConfirm();
  const [label, setLabel] = useState(poi?.label || '');
  const [category, setCategory] = useState(poi?.category || 'batiment');
  const [note, setNote] = useState(poi?.note || '');
  const [x, setX] = useState(poi?.x ?? prefill?.x ?? 0);
  const [y, setY] = useState(poi?.y ?? prefill?.y ?? 64);
  const [z, setZ] = useState(poi?.z ?? prefill?.z ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { label, category, note, x: Number(x), y: Number(y), z: Number(z) };
      if (poi) await api.quests.updatePoi(poi.id, body);
      else await api.quests.createPoi(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Supprimer le point', danger: true, confirmLabel: 'Supprimer', message: `« ${poi.label} » sera supprimé de la carte.` });
    if (!ok) return;
    await api.quests.deletePoi(poi.id); onDone();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12.5 }}>Erreur : {err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
        <Field label="Nom"><Input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="Ferme à fer" autoFocus /></Field>
        <Field label="Catégorie">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {POI_CATEGORY_ORDER.map((c) => <option key={c} value={c}>{POI_CATEGORIES[c].icon} {POI_CATEGORIES[c].label}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="X"><Input type="number" value={x} onChange={(e) => setX(e.target.value)} /></Field>
        <Field label="Y"><Input type="number" value={y} onChange={(e) => setY(e.target.value)} /></Field>
        <Field label="Z"><Input type="number" value={z} onChange={(e) => setZ(e.target.value)} /></Field>
      </div>
      <Field label="Note (optionnel)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ce qu'on y trouve, comment y farmer…" /></Field>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        {poi ? <Button type="button" variant="danger" onClick={remove}>Supprimer</Button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </div>
    </form>
  );
}
