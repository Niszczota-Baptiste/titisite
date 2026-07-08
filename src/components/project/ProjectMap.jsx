import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { ImageUploadField } from '../admin/ImageUploadField';
import { computeView, gridLines, niceStep } from '../quests/mapGrid';
import { professionEmoji } from './Villagers';
import { WORLDS } from './Minecraft';
import { Button, ErrorBanner, Field, Input, Modal, Section, muted } from './shared';

// « 🗺️ Carte » : la carte du projet — coffres, villageois et POI libres
// (bases, portails, fermes…) posés sur une grille pannable/zoomable. Comme la
// carte des quêtes : cartes nommées (minecraft_maps), image de fond 2D calibrée
// optionnelle, vue par défaut mémorisable. Les mondes de base (Overworld /
// Nether / End) restent des cartes synthétiques toujours disponibles.

export const POI_CATEGORIES = [
  { id: 'base',    label: 'Base',    emoji: '🏠', color: '#4dd9ac' },
  { id: 'portail', label: 'Portail', emoji: '🌀', color: '#c084fc' },
  { id: 'ferme',   label: 'Ferme',   emoji: '🌾', color: '#e8c86a' },
  { id: 'village', label: 'Village', emoji: '🛖', color: '#fb923c' },
  { id: 'grotte',  label: 'Grotte',  emoji: '⛏️', color: '#94a3b8' },
  { id: 'autre',   label: 'Autre',   emoji: '📍', color: '#60a5fa' },
];
const poiMeta = (cat) => POI_CATEGORIES.find((c) => c.id === cat) || POI_CATEGORIES[POI_CATEGORIES.length - 1];

const CHEST_COLOR = '#c9a8e8';
const VILLAGER_COLOR = '#7bd3e8';
const CLICK_SLOP = 4; // px de mouvement en dessous desquels un drag compte comme un clic

// Cartes synthétiques des mondes de base (non éditables, sans image) :
// « key » = `world:<id>` pour les distinguer des cartes personnalisées (id num).
function defaultMaps(worldIds) {
  return worldIds.map((id) => {
    const w = WORLDS.find((x) => x.id === id) || { id, label: id, emoji: '🗺️' };
    return { key: `world:${id}`, id: null, nom: `${w.emoji} ${w.label}`, world: id, couleur: '#c9a8e8', synthetic: true };
  });
}

export function ProjectMapTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const toast = useToast();
  const confirm = useConfirm();

  const [chests, setChests] = useState([]);
  const [villagers, setVillagers] = useState([]);
  const [pois, setPois] = useState([]);
  const [customMaps, setCustomMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [selectedKey, setSelectedKey] = useState('world:overworld');

  const [poiModal, setPoiModal] = useState(null); // { poi } | { at: {x,z} } | null
  const [mapModal, setMapModal] = useState(null);  // map | 'new' | null

  const reloadMaps = () => ws.minecraft.maps.list().then(setCustomMaps).catch(() => {});

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([
      ws.minecraft.chests.list(),
      ws.minecraft.villagers.list().catch(() => []),
      ws.minecraft.mapPois.list(),
      ws.minecraft.maps.list().catch(() => []),
    ])
      .then(([chs, vlg, ps, mps]) => {
        if (!alive) return;
        setChests(chs); setVillagers(vlg); setPois(ps); setCustomMaps(mps);
      })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [workspace.slug]);

  // Liste des cartes : mondes de base (présents dans les données ou vanilla) +
  // cartes personnalisées. Chaque entrée a une `key` unique.
  const maps = useMemo(() => {
    const worldIds = new Set(WORLDS.map((w) => w.id));
    for (const it of [...chests, ...villagers, ...pois]) if (it.world) worldIds.add(it.world);
    for (const m of customMaps) if (m.world) worldIds.add(m.world);
    const customs = customMaps.map((m) => ({ ...m, key: `map:${m.id}`, synthetic: false }));
    return [...defaultMaps([...worldIds]), ...customs];
  }, [chests, villagers, pois, customMaps]);

  const selectedMap = maps.find((m) => m.key === selectedKey) || maps[0] || null;
  const world = selectedMap?.world || 'overworld';

  const inWorld = (list) => list.filter((it) => (it.world || 'overworld') === world && it.x != null && it.z != null);
  const worldChests = useMemo(() => inWorld(chests), [chests, world]); // eslint-disable-line
  const worldVillagers = useMemo(() => inWorld(villagers), [villagers, world]); // eslint-disable-line
  const worldPois = useMemo(() => inWorld(pois), [pois, world]); // eslint-disable-line

  const savePoi = async (payload, poi) => {
    const saved = poi
      ? await ws.minecraft.mapPois.update(poi.id, payload)
      : await ws.minecraft.mapPois.create({ ...payload, world });
    setPois((prev) => (poi ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]));
    toast.success(poi ? 'Point mis à jour' : 'Point ajouté');
  };

  const removePoi = async (poi) => {
    const ok = await confirm({
      title: `Supprimer « ${poi.name} »`,
      message: 'Ce point sera retiré de la carte.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return false;
    await ws.minecraft.mapPois.remove(poi.id);
    setPois((prev) => prev.filter((p) => p.id !== poi.id));
    toast.success('Point supprimé');
    return true;
  };

  // Mémorise la vue courante (centre/zoom) comme défaut de la carte personnalisée.
  const saveView = async (cx, cz, span) => {
    if (!selectedMap || selectedMap.synthetic) return;
    await ws.minecraft.maps.update(selectedMap.id, {
      centerX: cx, centerZ: cz, defaultSpan: span,
    });
    await reloadMaps();
    toast.success('Vue par défaut mémorisée');
  };

  const initialView = selectedMap && !selectedMap.synthetic
    ? { cx: selectedMap.centerX, cz: selectedMap.centerZ, span: selectedMap.defaultSpan }
    : null;
  const image = selectedMap?.imageUrl
    ? { url: selectedMap.imageUrl, cx: selectedMap.imgCenterX, cz: selectedMap.imgCenterZ, span: selectedMap.imgSpan }
    : null;

  return (
    <Section title="🗺️ Carte du projet">
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />
      <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        Coffres, villageois et points d'intérêt sur une seule carte. Ajoute une
        vraie carte 2D (image) calibrée aux coordonnées, comme pour les quêtes.
      </p>

      {/* Sélecteur de cartes (mondes de base + cartes personnalisées) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {maps.map((m) => {
          const active = m.key === selectedMap?.key;
          return (
            <button key={m.key} type="button" onClick={() => setSelectedKey(m.key)}
              style={{
                padding: '6px 12px', borderRadius: 12, cursor: 'pointer',
                background: active ? `${m.couleur}28` : 'rgba(20,12,40,0.5)',
                border: `1px solid ${active ? m.couleur : 'rgba(80,50,130,0.3)'}`,
                color: active ? m.couleur : 'rgba(180,170,200,0.7)',
                fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
              }}
            >
              {m.synthetic ? m.nom : `🗺 ${m.nom}`}
            </button>
          );
        })}
        {selectedMap && !selectedMap.synthetic && (
          <Button variant="ghost" onClick={() => setMapModal(selectedMap)} style={{ padding: '6px 11px' }}>✎ Carte</Button>
        )}
        <Button variant="ghost" onClick={() => setMapModal('new')} style={{ padding: '6px 11px' }}>+ Carte</Button>
      </div>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <WorldCanvas
          key={selectedMap?.key}
          chests={worldChests} villagers={worldVillagers} pois={worldPois}
          image={image} initialView={initialView}
          canSaveView={!!selectedMap && !selectedMap.synthetic}
          onSaveView={saveView}
          onEditPoi={(p) => setPoiModal({ poi: p })}
          onAddAt={(x, z) => setPoiModal({ at: { x, z } })}
        />
      )}

      {poiModal && (
        <PoiModal
          poi={poiModal.poi || null} at={poiModal.at || null}
          onClose={() => setPoiModal(null)}
          onSave={async (payload) => {
            try { await savePoi(payload, poiModal.poi); setPoiModal(null); }
            catch (e) { toast.error(`Échec : ${e.message}`); }
          }}
          onRemove={poiModal.poi ? async () => {
            try { if (await removePoi(poiModal.poi)) setPoiModal(null); }
            catch (e) { toast.error(`Échec : ${e.message}`); }
          } : null}
        />
      )}

      {mapModal && (
        <MapModal
          map={mapModal === 'new' ? null : mapModal}
          ws={ws} defaultWorld={world} toast={toast} confirm={confirm}
          onClose={() => setMapModal(null)}
          onSaved={async (saved) => {
            setMapModal(null);
            await reloadMaps();
            if (saved?.id) setSelectedKey(`map:${saved.id}`);
          }}
          onDeleted={async () => {
            setMapModal(null);
            await reloadMaps();
            setSelectedKey('world:overworld');
          }}
        />
      )}
    </Section>
  );
}

// Grille monde pannable/zoomable : coffres (carrés), villageois (ronds bleus),
// POI (ronds colorés par catégorie). Image de fond 2D calibrée optionnelle,
// opacité + grille réglables, « 💾 Vue par défaut » pour les cartes nommées.
function WorldCanvas({ chests, villagers, pois, image, initialView, canSaveView, onSaveView, onEditPoi, onAddAt }) {
  const boxRef = useRef(null);
  const drag = useRef(null);
  const all = [...chests, ...villagers, ...pois];
  const fit = () => computeView(all, { defaultSpan: 512, padFactor: 1.8, minSpan: 128 });
  const [view, setView] = useState(() => initialView || fit());
  const [addMode, setAddMode] = useState(false);
  const [showChests, setShowChests] = useState(true);
  const [showVillagers, setShowVillagers] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [showGrid, setShowGrid] = useState(!image);
  const [imgOpacity, setImgOpacity] = useState(1);
  const [imgDim, setImgDim] = useState(null); // dimensions naturelles de l'image de fond
  const [hover, setHover] = useState(null); // { kind, id }

  const pos = (x, z) => ({
    left: `${((x - view.cx) / view.span + 0.5) * 100}%`,
    top: `${((z - view.cz) / view.span + 0.5) * 100}%`,
  });
  // Image de fond placée dans l'espace monde (centrée sur img.cx/cz, img.span
  // blocs de large, hauteur déduite du ratio naturel).
  const imgStyle = () => {
    const aspect = imgDim ? imgDim.h / imgDim.w : 1;
    const spanX = image.span;
    const spanZ = spanX * aspect;
    return {
      position: 'absolute',
      left: `${((image.cx - spanX / 2 - view.cx) / view.span + 0.5) * 100}%`,
      top: `${((image.cz - spanZ / 2 - view.cz) / view.span + 0.5) * 100}%`,
      width: `${(spanX / view.span) * 100}%`,
      height: `${(spanZ / view.span) * 100}%`,
      opacity: imgOpacity, pointerEvents: 'none', userSelect: 'none',
    };
  };
  const worldAt = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: Math.round(view.cx + ((clientX - r.left) / r.width - 0.5) * view.span),
      z: Math.round(view.cz + ((clientY - r.top) / r.height - 0.5) * view.span),
    };
  };
  const zoom = (factor) => setView((v) => ({ ...v, span: clamp(v.span * factor, 32, 200000) }));
  const recenter = () => setView(initialView || fit());

  const onDown = (e) => {
    drag.current = { x0: e.clientX, y0: e.clientY, cx: view.cx, cz: view.cz, moved: 0 };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const dx = e.clientX - drag.current.x0;
    const dy = e.clientY - drag.current.y0;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx) + Math.abs(dy));
    setView((v) => ({
      ...v,
      cx: drag.current.cx - (dx / r.width) * v.span,
      cz: drag.current.cz - (dy / r.height) * v.span,
    }));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved < CLICK_SLOP && addMode) {
      const { x, z } = worldAt(e.clientX, e.clientY);
      onAddAt(x, z);
      setAddMode(false);
    }
  };

  const step = niceStep(view.span);
  const lines = gridLines(view, step);

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <TB onClick={() => zoom(0.75)} title="Zoom avant">＋</TB>
        <TB onClick={() => zoom(1.3333)} title="Zoom arrière">－</TB>
        <TB onClick={recenter} title="Revenir au centre de la carte">Recentrer</TB>
        <TB onClick={() => setView(fit())} title="Cadrer sur tous les points">Ajuster</TB>
        {canSaveView && onSaveView && (
          <TB onClick={() => onSaveView(Math.round(view.cx), Math.round(view.cz), Math.round(view.span))}
            title="Mémoriser la vue actuelle comme centre/zoom par défaut de cette carte">💾 Vue par défaut</TB>
        )}
        <Toggle on={showChests} onClick={() => setShowChests((v) => !v)} color={CHEST_COLOR}>■ Coffres ({chests.length})</Toggle>
        <Toggle on={showVillagers} onClick={() => setShowVillagers((v) => !v)} color={VILLAGER_COLOR}>● Villageois ({villagers.length})</Toggle>
        <Toggle on={showPois} onClick={() => setShowPois((v) => !v)} color="#e8c86a">● Points ({pois.length})</Toggle>
        {image && <Toggle on={showGrid} onClick={() => setShowGrid((v) => !v)} color="#7bd3e8"># Grille</Toggle>}
        {image && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(180,170,200,0.6)', fontFamily: "'Inter',sans-serif" }} title="Opacité de l'image de fond">
            🖼
            <input type="range" min="0.15" max="1" step="0.05" value={imgOpacity}
              onChange={(e) => setImgOpacity(+e.target.value)} style={{ accentColor: '#c9a8e8', width: 70 }} />
          </label>
        )}
        <button
          type="button"
          onClick={() => setAddMode((v) => !v)}
          style={{
            marginLeft: 'auto', padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700,
            background: addMode ? '#7be3a8' : 'transparent', color: addMode ? '#08130b' : '#7be3a8',
            border: '1px solid #7be3a8',
          }}
        >{addMode ? '✓ Clique la carte…' : '+ Ajouter un point'}</button>
      </div>

      {/* map */}
      <div
        ref={boxRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => { drag.current = null; }}
        style={{
          position: 'relative', width: '100%', maxWidth: 680, aspectRatio: '1',
          margin: '0 auto', userSelect: 'none',
          background: 'radial-gradient(circle at 50% 40%, rgba(30,20,55,0.9), rgba(8,5,20,0.96))',
          border: '1px solid rgba(201,168,232,0.25)', borderRadius: 12, overflow: 'hidden',
          cursor: addMode ? 'crosshair' : (drag.current ? 'grabbing' : 'grab'),
        }}
      >
        {image && (
          <img src={image.url} alt="" draggable={false}
            onLoad={(e) => setImgDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={imgStyle()} />
        )}
        {showGrid && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            {lines.v.map((l) => (
              <line key={`v${l.world}`} x1={`${l.pct}%`} y1="0" x2={`${l.pct}%`} y2="100%"
                stroke={l.axis ? 'rgba(201,168,232,0.5)' : `rgba(120,90,180,${image ? 0.09 : 0.13})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
            {lines.h.map((l) => (
              <line key={`h${l.world}`} x1="0" y1={`${l.pct}%`} x2="100%" y2={`${l.pct}%`}
                stroke={l.axis ? 'rgba(201,168,232,0.5)' : `rgba(120,90,180,${image ? 0.09 : 0.13})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
          </svg>
        )}

        {/* coffres (carrés violets) */}
        {showChests && chests.map((c) => (
          <Marker key={`c${c.id}`} pos={pos(c.x, c.z)} shape="square" color={CHEST_COLOR}
            lit={hover?.kind === 'c' && hover.id === c.id}
            icon="🧰" label={c.name}
            sub={`Coffre · X ${c.x} Y ${c.y ?? '?'} Z ${c.z}${c.note ? ` — ${c.note}` : ''}`}
            onEnter={() => setHover({ kind: 'c', id: c.id })} onLeave={() => setHover(null)}
          />
        ))}

        {/* villageois (ronds bleus) */}
        {showVillagers && villagers.map((v) => (
          <Marker key={`v${v.id}`} pos={pos(v.x, v.z)} shape="circle" color={VILLAGER_COLOR}
            lit={hover?.kind === 'v' && hover.id === v.id}
            icon={professionEmoji(v.profession)} label={v.name}
            sub={`${v.profession || 'Villageois'} · X ${v.x} Y ${v.y ?? '?'} Z ${v.z}`}
            onEnter={() => setHover({ kind: 'v', id: v.id })} onLeave={() => setHover(null)}
          />
        ))}

        {/* POI (ronds colorés par catégorie) */}
        {showPois && pois.map((p) => {
          const cat = poiMeta(p.category);
          return (
            <Marker key={`p${p.id}`} pos={pos(p.x, p.z)} shape="circle" color={cat.color}
              lit={hover?.kind === 'p' && hover.id === p.id}
              icon={cat.emoji} label={p.name}
              sub={`${cat.label} · X ${p.x} Y ${p.y ?? '?'} Z ${p.z}${p.note ? ` — ${p.note}` : ''}`}
              onEnter={() => setHover({ kind: 'p', id: p.id })} onLeave={() => setHover(null)}
              onClick={(e) => { e.stopPropagation(); onEditPoi(p); }}
            />
          );
        })}

        {all.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13, textAlign: 'center', padding: 24,
          }}>
            Rien dans ce monde pour l'instant. Ajoute des coordonnées à tes coffres
            et villageois, ou pose un point avec « + Ajouter un point ».
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 8, color: 'rgba(180,170,200,0.5)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
        centre X {Math.round(view.cx)} / Z {Math.round(view.cz)} · grille {step} blocs · glisse pour te déplacer, ＋/－ pour zoomer
      </p>
    </div>
  );
}

function Marker({ pos, lit, shape, color, icon, label, sub, onEnter, onLeave, onClick }) {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      onMouseDown={(e) => { if (onClick) e.stopPropagation(); }}
      title={`${label} — ${sub}`}
      style={{
        position: 'absolute', ...pos, transform: 'translate(-50%,-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'inherit',
        padding: 3, zIndex: lit ? 6 : 2,
      }}
    >
      <span style={{
        width: lit ? 15 : 11, height: lit ? 15 : 11,
        borderRadius: shape === 'circle' ? '50%' : 3,
        background: lit ? color : 'rgba(11,6,32,0.9)', border: `2px solid ${color}`,
        boxShadow: lit ? `0 0 12px ${color}` : '0 0 5px rgba(0,0,0,0.6)', transition: 'all 0.12s',
      }} />
      {lit && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: 'nowrap',
          color, background: 'rgba(8,5,20,0.85)', border: `1px solid ${color}`,
          borderRadius: 5, padding: '0 5px',
        }}>{icon} {label}</span>
      )}
    </button>
  );
}

// Modal POI : création (coordonnées pré-remplies par le clic) ou édition.
function PoiModal({ poi, at, onClose, onSave, onRemove }) {
  const [name, setName] = useState(poi?.name || '');
  const [category, setCategory] = useState(poi?.category || 'autre');
  const [x, setX] = useState(poi?.x ?? at?.x ?? '');
  const [y, setY] = useState(poi?.y ?? '');
  const [z, setZ] = useState(poi?.z ?? at?.z ?? '');
  const [note, setNote] = useState(poi?.note || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), category, x, y, z, note: note.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={poi ? `Modifier « ${poi.name} »` : 'Nouveau point d\'intérêt'} width={520}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder="Nom (ex. Base principale, Portail du hall…)" style={inp} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {POI_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                style={{
                  padding: '6px 10px', borderRadius: 12, cursor: 'pointer',
                  background: active ? `${c.color}22` : 'rgba(20,12,40,0.6)',
                  border: `1px solid ${active ? c.color : 'rgba(80,50,130,0.3)'}`,
                  color: active ? c.color : 'rgba(180,170,200,0.7)',
                  fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: active ? 600 : 400,
                }}
              >
                {c.emoji} {c.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={x} onChange={(e) => setX(e.target.value)} placeholder="X" type="number" style={{ ...inp, width: 90 }} />
          <input value={y} onChange={(e) => setY(e.target.value)} placeholder="Y (opt.)" type="number" style={{ ...inp, width: 90 }} />
          <input value={z} onChange={(e) => setZ(e.target.value)} placeholder="Z" type="number" style={{ ...inp, width: 90 }} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optionnel)" style={inp} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Enregistrement…' : (poi ? 'Enregistrer' : 'Ajouter')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          {onRemove && (
            <Button type="button" variant="ghost" onClick={onRemove} disabled={saving}
              style={{ marginLeft: 'auto', color: '#f87171' }}>
              Supprimer
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// Modal carte nommée : nom, monde, vue par défaut, image de fond 2D calibrée.
function MapModal({ map, ws, defaultWorld, toast, confirm, onClose, onSaved, onDeleted }) {
  const [nom, setNom] = useState(map?.nom || '');
  const [world, setWorld] = useState(map?.world || defaultWorld || 'overworld');
  const [couleur, setCouleur] = useState(map?.couleur || '#c9a8e8');
  const [centerX, setCenterX] = useState(map?.centerX ?? 0);
  const [centerZ, setCenterZ] = useState(map?.centerZ ?? 0);
  const [defaultSpan, setDefaultSpan] = useState(map?.defaultSpan ?? 512);
  const [imageUrl, setImageUrl] = useState(map?.imageUrl || '');
  const [imgCenterX, setImgCenterX] = useState(map?.imgCenterX ?? map?.centerX ?? 0);
  const [imgCenterZ, setImgCenterZ] = useState(map?.imgCenterZ ?? map?.centerZ ?? 0);
  const [imgSpan, setImgSpan] = useState(map?.imgSpan ?? map?.defaultSpan ?? 512);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!nom.trim()) { setErr('Donne un nom à la carte.'); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        nom: nom.trim(), world, couleur,
        centerX: Number(centerX), centerZ: Number(centerZ), defaultSpan: Number(defaultSpan),
        imageFilename: imageUrl || null,
        imgCenterX: Number(imgCenterX), imgCenterZ: Number(imgCenterZ), imgSpan: Number(imgSpan),
      };
      const out = map ? await ws.minecraft.maps.update(map.id, body) : await ws.minecraft.maps.create(body);
      toast.success(map ? 'Carte mise à jour' : 'Carte créée');
      onSaved(out);
    } catch (e) { setErr(e.message || 'Enregistrement impossible'); setSaving(false); }
  };
  const remove = async () => {
    const ok = await confirm({ title: `Supprimer « ${map.nom} »`, danger: true, confirmLabel: 'Supprimer', message: 'La carte (image + réglages) sera supprimée. Coffres, villageois et points ne bougent pas.' });
    if (!ok) return;
    try { await ws.minecraft.maps.remove(map.id); toast.success('Carte supprimée'); onDeleted(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Modal open onClose={onClose} title={map ? `Modifier « ${map.nom} »` : 'Nouvelle carte'} width={540}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err && <p style={{ color: '#ff8a9b', fontSize: 12.5, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Atlas de l'Overworld" autoFocus /></Field>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <Field label="Monde">
              <select value={world} onChange={(e) => setWorld(e.target.value)} style={{ ...inp, width: '100%' }}>
                {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.emoji} {w.label}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: '0 0 60px' }}>
            <Field label="Couleur">
              <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)}
                style={{ width: '100%', height: 38, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
            </Field>
          </div>
        </div>

        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(180,170,200,0.55)', fontWeight: 600 }}>
          Centre & zoom par défaut
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Centre X"><Input type="number" value={centerX} onChange={(e) => setCenterX(e.target.value)} /></Field>
          <Field label="Centre Z"><Input type="number" value={centerZ} onChange={(e) => setCenterZ(e.target.value)} /></Field>
          <Field label="Largeur (blocs)"><Input type="number" value={defaultSpan} onChange={(e) => setDefaultSpan(e.target.value)} /></Field>
        </div>
        <p style={{ ...muted, fontSize: 11.5, margin: 0 }}>
          Astuce : cadre la carte à la souris puis clique « 💾 Vue par défaut ».
        </p>

        <div style={{ borderTop: '1px solid rgba(80,50,130,0.2)', margin: '2px 0' }} />
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(180,170,200,0.55)', fontWeight: 600 }}>
          Vraie carte 2D (image de fond, optionnel)
        </div>
        <ImageUploadField
          label="Importe une image de ta carte (capture / atlas) — elle remplace la grille"
          value={imageUrl}
          onChange={(url) => setImageUrl(url || '')}
          aspect="1/1"
          uploadFn={(file) => ws.minecraft.uploadImage(file)}
        />
        {imageUrl && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Image centre X"><Input type="number" value={imgCenterX} onChange={(e) => setImgCenterX(e.target.value)} /></Field>
              <Field label="Image centre Z"><Input type="number" value={imgCenterZ} onChange={(e) => setImgCenterZ(e.target.value)} /></Field>
              <Field label="Largeur image (blocs)"><Input type="number" value={imgSpan} onChange={(e) => setImgSpan(e.target.value)} /></Field>
            </div>
            <p style={{ ...muted, fontSize: 11.5, margin: 0 }}>
              Ajuste ces valeurs (centre = coordonnées au milieu de l'image, largeur = blocs couverts)
              jusqu'à ce que les marqueurs se calent sur l'image — l'aperçu est en direct.
            </p>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          {map ? <Button type="button" variant="ghost" onClick={remove} style={{ color: '#f87171' }}>Supprimer</Button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving || !nom.trim()}>{saving ? '…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TB({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 13, fontWeight: 700, background: 'rgba(20,14,38,0.7)', color: '#ede8f8',
      border: '1px solid rgba(201,168,232,0.25)',
    }}>{children}</button>
  );
}

function Toggle({ children, on, onClick, color }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 12.5, fontWeight: 600, color: on ? color : 'rgba(180,170,200,0.5)',
      background: on ? 'rgba(120,90,180,0.14)' : 'transparent',
      border: `1px solid ${on ? color : 'rgba(80,50,130,0.3)'}`, opacity: on ? 1 : 0.6,
    }}>{children}</button>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const inp = {
  boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};
