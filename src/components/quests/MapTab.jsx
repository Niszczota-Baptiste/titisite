import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../project/shared';
import { useConfirm } from '../../ui/ConfirmProvider';
import { Button, Field, Input, Textarea } from '../admin/ui';
import { QuestWorldMap } from './QuestWorldMap';
import { ACC, ACC_RGB, INK, MUTED, POI_CATEGORIES, POI_CATEGORY_ORDER, hexToRgb } from './theme';

const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
  borderRadius: 8, padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};

// « Carte » tab: pick a map, view its aggregated quest points + free POIs on a
// pannable grid centred on the map's own coordinates, and (for editors) manage
// maps and POIs.
export function MapTab({ canEdit, onOpenQuest }) {
  const [maps, setMaps] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [data, setData] = useState(null);
  const [editingPoi, setEditingPoi] = useState(null); // poi | { x, y, z } | null
  const [editingMap, setEditingMap] = useState(null); // map | 'new' | null
  const [err, setErr] = useState(null);

  const loadMaps = useCallback(async () => {
    const ms = await api.quests.maps();
    setMaps(ms);
    setSelectedId((cur) => (cur && ms.some((m) => m.id === cur) ? cur : ms[0]?.id ?? null));
    return ms;
  }, []);

  const loadWorld = useCallback(async (mapId) => {
    if (mapId == null) { setData({ questPoints: [], pois: [] }); return; }
    setData(await api.quests.map(mapId));
  }, []);

  useEffect(() => { loadMaps().catch((e) => setErr(e.message)); }, [loadMaps]);
  useEffect(() => { if (selectedId != null) loadWorld(selectedId).catch((e) => setErr(e.message)); }, [selectedId, loadWorld]);

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;
  if (!maps || !data) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;

  const selectedMap = maps.find((m) => m.id === selectedId) || null;
  const initialView = selectedMap
    ? { cx: selectedMap.centerX, cz: selectedMap.centerZ, span: selectedMap.defaultSpan }
    : null;

  const saveView = async (cx, cz, span) => {
    if (!selectedMap) return;
    await api.quests.updateMap(selectedMap.id, {
      nom: selectedMap.nom, description: selectedMap.description, couleur: selectedMap.couleur,
      centerX: cx, centerZ: cz, defaultSpan: span,
    });
    await loadMaps();
  };

  return (
    <div>
      {/* map selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        {maps.map((m) => {
          const on = m.id === selectedId;
          return (
            <button key={m.id} type="button" onClick={() => setSelectedId(m.id)}
              style={{
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                fontSize: 13, fontWeight: 700,
                color: on ? '#08051a' : m.couleur, background: on ? m.couleur : `rgba(${hexToRgb(m.couleur)},0.1)`,
                border: `1px solid ${m.couleur}`,
              }}
            >🗺 {m.nom}</button>
          );
        })}
        {canEdit && (
          <>
            {selectedMap && (
              <Button variant="ghost" onClick={() => setEditingMap(selectedMap)} style={{ padding: '6px 11px' }}>✎ Carte</Button>
            )}
            <Button variant="ghost" onClick={() => setEditingMap('new')} style={{ padding: '6px 11px' }}>+ Carte</Button>
          </>
        )}
      </div>

      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.55 }}>
        {selectedMap?.description || 'Points de carte des quêtes + points libres réunis sur une grille.'}
        {canEdit && ' Glisse/zoom pour cadrer, puis « 💾 Vue par défaut » pour mémoriser le centre de la carte.'}
      </p>

      <QuestWorldMap
        key={selectedId}
        questPoints={data.questPoints}
        pois={data.pois}
        canEdit={canEdit}
        initialView={initialView}
        onOpenQuest={onOpenQuest}
        onEditPoi={(poi) => setEditingPoi(poi)}
        onAddAt={(x, z) => setEditingPoi({ x, y: 64, z })}
        onSaveView={saveView}
      />

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
                <button key={p.id} type="button" onClick={() => canEdit && setEditingPoi(p)}
                  style={{
                    textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', padding: '9px 11px',
                    borderRadius: 10, background: 'rgba(14,9,28,0.72)', border: '1px solid rgba(80,50,130,0.24)',
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

      <Modal open={editingPoi != null} onClose={() => setEditingPoi(null)} title={editingPoi?.id ? 'Modifier le point' : 'Nouveau point'} width={500}>
        {editingPoi != null && (
          <PoiForm
            poi={editingPoi.id ? editingPoi : null}
            prefill={editingPoi.id ? null : editingPoi}
            maps={maps}
            defaultMapId={selectedId}
            onDone={() => { setEditingPoi(null); loadWorld(selectedId); }}
            onCancel={() => setEditingPoi(null)}
          />
        )}
      </Modal>

      <Modal open={editingMap != null} onClose={() => setEditingMap(null)} title={editingMap?.id ? 'Modifier la carte' : 'Nouvelle carte'} width={520}>
        {editingMap != null && (
          <MapForm
            map={editingMap === 'new' ? null : editingMap}
            canDelete={maps.length > 1}
            onDone={async (nextId) => {
              setEditingMap(null);
              const ms = await loadMaps();
              if (nextId && ms.some((m) => m.id === nextId)) setSelectedId(nextId);
            }}
            onCancel={() => setEditingMap(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function PoiForm({ poi, prefill, maps, defaultMapId, onDone, onCancel }) {
  const confirm = useConfirm();
  const [label, setLabel] = useState(poi?.label || '');
  const [category, setCategory] = useState(poi?.category || 'batiment');
  const [note, setNote] = useState(poi?.note || '');
  const [mapId, setMapId] = useState(poi?.mapId ?? defaultMapId ?? maps[0]?.id ?? '');
  const [x, setX] = useState(poi?.x ?? prefill?.x ?? 0);
  const [y, setY] = useState(poi?.y ?? prefill?.y ?? 64);
  const [z, setZ] = useState(poi?.z ?? prefill?.z ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { label, category, note, mapId: Number(mapId), x: Number(x), y: Number(y), z: Number(z) };
      if (poi) await api.quests.updatePoi(poi.id, body);
      else await api.quests.createPoi(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Supprimer le point', danger: true, confirmLabel: 'Supprimer', message: `« ${poi.label} » sera supprimé.` });
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
      <Field label="Carte">
        <select value={mapId} onChange={(e) => setMapId(e.target.value)} style={selectStyle}>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
      </Field>
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

function MapForm({ map, canDelete, onDone, onCancel }) {
  const confirm = useConfirm();
  const [nom, setNom] = useState(map?.nom || '');
  const [description, setDescription] = useState(map?.description || '');
  const [couleur, setCouleur] = useState(map?.couleur || '#c9a8e8');
  const [centerX, setCenterX] = useState(map?.centerX ?? 0);
  const [centerZ, setCenterZ] = useState(map?.centerZ ?? 0);
  const [defaultSpan, setDefaultSpan] = useState(map?.defaultSpan ?? 512);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { nom, description, couleur, centerX: Number(centerX), centerZ: Number(centerZ), defaultSpan: Number(defaultSpan) };
      const out = map ? await api.quests.updateMap(map.id, body) : await api.quests.createMap(body);
      onDone(out?.id);
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Supprimer la carte', danger: true, confirmLabel: 'Supprimer', message: `« ${map.nom} » sera supprimée. Ses points libres et points de quête basculent sur la carte par défaut.` });
    if (!ok) return;
    try { await api.quests.deleteMap(map.id); onDone(); }
    catch (e) { setErr(e.body?.error || e.message); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12.5 }}>Erreur : {err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px', gap: 10 }}>
        <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Overworld / Nether…" autoFocus /></Field>
        <Field label="Couleur">
          <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)}
            style={{ width: '100%', height: 38, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
        </Field>
      </div>
      <Field label="Description (optionnel)"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: MUTED, margin: '6px 0', fontWeight: 600 }}>
        Centre & zoom par défaut de la grille
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Centre X"><Input type="number" value={centerX} onChange={(e) => setCenterX(e.target.value)} /></Field>
        <Field label="Centre Z"><Input type="number" value={centerZ} onChange={(e) => setCenterZ(e.target.value)} /></Field>
        <Field label="Largeur (blocs)"><Input type="number" value={defaultSpan} onChange={(e) => setDefaultSpan(e.target.value)} /></Field>
      </div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED, margin: '0 0 8px' }}>
        Astuce : tu peux aussi cadrer la carte à la souris puis cliquer « 💾 Vue par défaut ».
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        {map && canDelete ? <Button type="button" variant="danger" onClick={remove}>Supprimer</Button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </div>
    </form>
  );
}
