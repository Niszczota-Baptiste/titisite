import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { computeView, gridLines, niceStep } from '../quests/mapGrid';
import { professionEmoji } from './Villagers';
import { WORLDS } from './Minecraft';
import { Button, ErrorBanner, Modal, Section, muted } from './shared';

// « 🗺️ Carte » : la carte du projet — coffres, villageois et POI libres
// (bases, portails, fermes…) posés sur une grille pannable/zoomable, filtrée
// par monde. Même mécanique que la carte des quêtes (quests/mapGrid).

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

export function ProjectMapTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const toast = useToast();
  const confirm = useConfirm();

  const [chests, setChests] = useState([]);
  const [villagers, setVillagers] = useState([]);
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [world, setWorld] = useState('overworld');

  // Modal POI (création au clic / édition)
  const [poiModal, setPoiModal] = useState(null); // { poi } | { at: {x,z} } | null

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([
      ws.minecraft.chests.list(),
      ws.minecraft.villagers.list().catch(() => []),
      ws.minecraft.mapPois.list(),
    ])
      .then(([chs, vlg, ps]) => {
        if (!alive) return;
        setChests(chs); setVillagers(vlg); setPois(ps);
      })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [workspace.slug]);

  // Mondes présents dans les données (au-delà des trois vanilla).
  const worlds = useMemo(() => {
    const ids = new Set(WORLDS.map((w) => w.id));
    for (const it of [...chests, ...villagers, ...pois]) if (it.world) ids.add(it.world);
    return [...ids].map((id) => WORLDS.find((w) => w.id === id) || { id, label: id, emoji: '🗺️' });
  }, [chests, villagers, pois]);

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

  return (
    <Section title="🗺️ Carte du projet">
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />
      <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        Coffres, villageois et points d'intérêt sur une seule carte. Renseigne les
        coordonnées des coffres et villageois pour les voir apparaître.
      </p>

      {/* Filtre monde */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {worlds.map((w) => {
          const active = world === w.id;
          return (
            <button key={w.id} type="button" onClick={() => setWorld(w.id)}
              style={{
                padding: '6px 12px', borderRadius: 12, cursor: 'pointer',
                background: active ? 'rgba(201,168,232,0.16)' : 'rgba(20,12,40,0.5)',
                border: `1px solid ${active ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
                color: active ? '#c9a8e8' : 'rgba(180,170,200,0.7)',
                fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
              }}
            >
              {w.emoji} {w.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <WorldCanvas
          chests={worldChests} villagers={worldVillagers} pois={worldPois}
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
    </Section>
  );
}

// Grille monde pannable/zoomable : coffres (carrés), villageois (ronds bleus),
// POI (ronds colorés par catégorie). Clic sur un POI → édition ; « + Point »
// armé puis clic sur la grille → création à ces coordonnées.
function WorldCanvas({ chests, villagers, pois, onEditPoi, onAddAt }) {
  const boxRef = useRef(null);
  const drag = useRef(null);
  const all = [...chests, ...villagers, ...pois];
  const fit = () => computeView(all, { defaultSpan: 512, padFactor: 1.8, minSpan: 128 });
  const [view, setView] = useState(fit);
  const [addMode, setAddMode] = useState(false);
  const [showChests, setShowChests] = useState(true);
  const [showVillagers, setShowVillagers] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [hover, setHover] = useState(null); // { kind, id }

  const pos = (x, z) => ({
    left: `${((x - view.cx) / view.span + 0.5) * 100}%`,
    top: `${((z - view.cz) / view.span + 0.5) * 100}%`,
  });
  const worldAt = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: Math.round(view.cx + ((clientX - r.left) / r.width - 0.5) * view.span),
      z: Math.round(view.cz + ((clientY - r.top) / r.height - 0.5) * view.span),
    };
  };
  const zoom = (factor) => setView((v) => ({ ...v, span: clamp(v.span * factor, 32, 200000) }));

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
        <TB onClick={() => setView(fit())} title="Cadrer sur tous les points">Ajuster</TB>
        <Toggle on={showChests} onClick={() => setShowChests((v) => !v)} color={CHEST_COLOR}>■ Coffres ({chests.length})</Toggle>
        <Toggle on={showVillagers} onClick={() => setShowVillagers((v) => !v)} color={VILLAGER_COLOR}>● Villageois ({villagers.length})</Toggle>
        <Toggle on={showPois} onClick={() => setShowPois((v) => !v)} color="#e8c86a">● Points ({pois.length})</Toggle>
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
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
          {lines.v.map((l) => (
            <line key={`v${l.world}`} x1={`${l.pct}%`} y1="0" x2={`${l.pct}%`} y2="100%"
              stroke={l.axis ? 'rgba(201,168,232,0.5)' : 'rgba(120,90,180,0.13)'} strokeWidth={l.axis ? 1.2 : 1} />
          ))}
          {lines.h.map((l) => (
            <line key={`h${l.world}`} x1="0" y1={`${l.pct}%`} x2="100%" y2={`${l.pct}%`}
              stroke={l.axis ? 'rgba(201,168,232,0.5)' : 'rgba(120,90,180,0.13)'} strokeWidth={l.axis ? 1.2 : 1} />
          ))}
        </svg>

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
