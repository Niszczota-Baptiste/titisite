import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useCodex } from '../../hooks/useCodex';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useVaultPlan } from '../../hooks/useVaultPlan';
import { useToast } from '../../ui/ToastProvider';
import { ConflictModal } from './ConflictModal';
import { Dashboard } from './Dashboard';
import { FloorsPanel } from './FloorsPanel';
import { Inspector, WarningsPanel } from './Inspector';
import { ItemsPanel } from './ItemsPanel';
import { LogicMap } from './LogicMap';
import { PlanCanvas } from './PlanCanvas';
import { SharePanel, SnapshotsPanel } from './SnapshotsPanel';
import { StorageIndex } from './StorageIndex';
import { Toolbar } from './Toolbar';
import { VolumeView } from './VolumeView';
import { computeWarnings } from './capacity';
import { floorsByHeight, toWorldCoords } from './planGeometry';
import { GOLD, INK, MUTED, body, mono, panel, title } from './theme';

const TABS = [
  ['plan', '▦ Plan'],
  ['rangement', '📒 Rangement'],
  ['volume', '⬢ Volume'],
  ['capacite', '📊 Capacité'],
];

const RAILS = [
  ['fiche', 'Fiche'],
  ['items', 'Items'],
  ['verifs', 'Vérifs'],
  ['versions', 'Versions'],
];

export function VaultApp({ planId, onBack, onOpenPlan }) {
  const toast = useToast();
  const isMobile = useIsMobile(1024);
  const { byId: codexById } = useCodex();
  const plan = useVaultPlan(planId);
  const { meta, doc, update, patchMeta } = plan;

  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('plan');
  const [rail, setRail] = useState('fiche');
  const [floorId, setFloorId] = useState(null);
  const [currentY, setCurrentY] = useState(0);
  const [tool, setTool] = useState('select');
  const [options, setOptions] = useState({
    // 0 = mur monté sur toute la hauteur de la zone.
    maxLevels: 0, zoneColor: '#b02e2e', stairTarget: '',
  });
  const [overlays, setOverlays] = useState({ chunks: false, labels: true, heatmap: false, items: true });
  const [selection, setSelection] = useState({ type: null, ids: [] });
  const [focus, setFocus] = useState(null);
  const [hover, setHover] = useState(null);
  const [, tick] = useState(0);

  const loadCategories = useCallback(
    () => api.vault.categories.list().then(setCategories).catch(() => {}),
    [],
  );
  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Le bandeau affiche « il y a X s » : on redessine périodiquement.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Étage courant : le premier disponible tant qu'aucun n'est choisi.
  useEffect(() => {
    if (!doc) return;
    const exists = doc.floors.some((f) => f.id === floorId);
    if (exists) return;
    const first = floorsByHeight(doc.floors)[0];
    setFloorId(first?.id ?? null);
    setCurrentY(first?.yMin ?? 0);
  }, [doc, floorId]);

  const floor = doc?.floors.find((f) => f.id === floorId) || null;
  const warnings = useMemo(() => (doc ? computeWarnings(doc) : []), [doc]);
  const selectedZone = selection.type === 'zone'
    ? doc?.zones.find((z) => z.id === selection.ids[0]) || null
    : null;

  // ── Raccourcis ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) plan.redo(); else plan.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); plan.save(); return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.type === 'chest' && selection.ids.length > 0) {
          e.preventDefault();
          const ids = new Set(selection.ids);
          update((d) => ({ ...d, chests: d.chests.filter((c) => !ids.has(c.id)) }));
          setSelection({ type: null, ids: [] });
        }
        return;
      }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        const list = floorsByHeight(doc?.floors || []);
        const idx = list.findIndex((f) => f.id === floorId);
        const next = list[idx + (e.key === 'PageUp' ? -1 : 1)];
        if (next) { e.preventDefault(); setFloorId(next.id); setCurrentY(next.yMin); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plan, selection, update, doc, floorId]);

  const focusTarget = useCallback((w) => {
    if (w.floorId && w.floorId !== floorId) setFloorId(w.floorId);
    if (w.target?.type === 'chest') {
      const chest = doc.chests.find((c) => c.id === w.target.id);
      if (chest) setCurrentY(chest.y);
      setSelection({ type: 'chest', ids: [w.target.id] });
    } else if (w.target?.type === 'zone') {
      setSelection({ type: 'zone', ids: [w.target.id] });
    }
    setFocus({ ...w.target, at: Date.now() });
    setTab('plan');
    setRail('fiche');
  }, [doc, floorId]);

  // Depuis l'annuaire : ouvrir le plan sur le coffre exact d'une ligne.
  const focusChest = useCallback((chestId) => {
    const chest = doc?.chests.find((c) => c.id === chestId);
    if (!chest) return;
    const zone = chest.zoneId ? doc.zones.find((z) => z.id === chest.zoneId) : null;
    const floor = zone
      ? doc.floors.find((f) => f.id === zone.floorId)
      : doc.floors.find((f) => chest.y >= f.yMin && chest.y <= f.yMax);
    if (floor) setFloorId(floor.id);
    setCurrentY(chest.y);
    setSelection({ type: 'chest', ids: [chestId] });
    setFocus({ type: 'chest', id: chestId, at: Date.now() });
    setTab('plan');
    setRail('fiche');
  }, [doc]);

  const openZone = useCallback((zoneId, zoneFloorId) => {
    setFloorId(zoneFloorId);
    const zone = doc?.zones.find((z) => z.id === zoneId);
    if (zone) setCurrentY(zone.yMin);
    setSelection({ type: 'zone', ids: [zoneId] });
    setFocus({ type: 'zone', id: zoneId, at: Date.now() });
    setTab('plan');
    setRail('fiche');
  }, [doc]);

  if (plan.status === 'loading') {
    return <p style={{ ...body, color: MUTED, padding: 20 }}>Chargement du plan…</p>;
  }
  if (!meta || !doc) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ ...body, color: '#ff8a9b' }}>{plan.error || 'Plan introuvable.'}</p>
        <button type="button" onClick={onBack} style={ghostBtn}>← Retour aux plans</button>
      </div>
    );
  }

  const rails = (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {RAILS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setRail(k)} style={pill(rail === k)}>
            {l}{k === 'verifs' && warnings.length > 0 ? ` ${warnings.length}` : ''}
          </button>
        ))}
      </div>
      {rail === 'fiche' && (
        <Inspector
          doc={doc} floors={doc.floors} dims={meta.dims} selection={selection}
          categories={categories} onEdit={update} onSelect={setSelection}
        />
      )}
      {rail === 'items' && (
        <ItemsPanel
          categories={categories}
          onCategoriesChanged={loadCategories}
          selectedZone={selectedZone}
          onAssign={(categoryId) => update((d) => ({
            ...d,
            zones: d.zones.map((z) => (z.id === selectedZone.id && !(z.categoryIds || []).includes(categoryId)
              ? { ...z, categoryIds: [...(z.categoryIds || []), categoryId] } : z)),
          }))}
        />
      )}
      {rail === 'verifs' && (
        <WarningsPanel warnings={warnings} floors={doc.floors} onFocus={focusTarget} />
      )}
      {rail === 'versions' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <SnapshotsPanel planId={planId} onRestored={(p) => onOpenPlan(p.id)} />
          <SharePanel
            planId={planId}
            sharedWith={meta.sharedWith || []}
            isOwner={meta.role === 'owner'}
            onChanged={(sharedWith) => patchMeta({ sharedWith })}
          />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Header
        meta={meta} plan={plan} onBack={onBack} toast={toast}
        onRename={(name) => patchMeta({ name })}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={pill(tab === k, true)}>{l}</button>
        ))}
      </div>

      {tab === 'plan' && (
        <div style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: isMobile ? '1fr' : '212px minmax(0,1fr) 320px',
          alignItems: 'start',
        }}>
          <FloorsPanel
            doc={doc} dims={meta.dims} floorId={floorId} setFloorId={setFloorId}
            currentY={currentY} setCurrentY={setCurrentY} onEdit={update}
          />

          <div style={{ ...panel, padding: 12, minWidth: 0 }}>
            {floor ? (
              <>
                <Toolbar
                  tool={tool} setTool={setTool} options={options} setOptions={setOptions}
                  overlays={overlays} setOverlays={setOverlays}
                  floors={doc.floors} floor={floor}
                  onUndo={plan.undo} onRedo={plan.redo}
                  canUndo={plan.canUndo} canRedo={plan.canRedo}
                />
                <div style={{ height: isMobile ? '58vh' : '66vh', minHeight: 360 }}>
                  <PlanCanvas
                    doc={doc} dims={meta.dims} worldOrigin={meta.worldOrigin}
                    floor={floor} currentY={currentY}
                    tool={tool} options={options} overlays={overlays}
                    selection={selection} categories={categories} codexById={codexById}
                    onEdit={update} onSelect={setSelection} onHover={setHover}
                    focus={focus}
                  />
                </div>
                <StatusBar
                  hover={hover} currentY={currentY} origin={meta.worldOrigin}
                  dims={meta.dims} doc={doc} floor={floor}
                />
              </>
            ) : (
              <EmptyFloors />
            )}
          </div>

          {rails}
        </div>
      )}

      {tab === 'volume' && <VolumeView doc={doc} dims={meta.dims} onOpenZone={openZone} />}
      {tab === 'rangement' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <LogicMap doc={doc} categories={categories} onOpenZone={openZone} compact />
          <StorageIndex
            doc={doc} worldOrigin={meta.worldOrigin} categories={categories}
            onFocusChest={focusChest} onFocusZone={openZone}
          />
        </div>
      )}
      {tab === 'capacite' && (
        <Dashboard doc={doc} dims={meta.dims} categories={categories} warnings={warnings} />
      )}

      <ConflictModal
        conflict={plan.conflict}
        onReload={() => plan.reload().catch((e) => toast.error(e.message))}
        onOverwrite={() => plan.overwrite()}
        onDownload={plan.downloadLocal}
      />
    </div>
  );
}

function Header({ meta, plan, onBack, onRename, toast }) {
  const saved = plan.savedAt ? Math.round((Date.now() - plan.savedAt) / 1000) : null;
  const label = {
    loading: 'Chargement…',
    idle: 'À jour',
    dirty: 'Modifications non enregistrées…',
    saving: 'Enregistrement…',
    saved: saved != null ? `Dernière sauvegarde il y a ${saved} s` : 'Enregistré',
    conflict: 'Conflit à trancher',
    error: `Erreur : ${plan.error || ''}`,
  }[plan.status] || '';
  const color = plan.status === 'error' || plan.status === 'conflict' ? '#ff8a9b'
    : (plan.status === 'dirty' ? '#e8c86a' : '#9ad4ae');

  return (
    <div style={{ ...panel, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={onBack} style={ghostBtn}>← Plans</button>
      <input
        value={meta.name}
        onChange={(e) => onRename(e.target.value)}
        style={{
          ...title, fontSize: 17, background: 'transparent', border: 'none', color: INK,
          borderBottom: '1px solid rgba(120,100,170,0.25)', padding: '2px 0', minWidth: 220, flex: 1,
        }}
      />
      <span style={{ ...mono, fontSize: 11, color: MUTED }}>
        {meta.dims.x}×{meta.dims.y}×{meta.dims.z} · MC {meta.mcVersion} · rév. {meta.revision}
      </span>
      <span style={{ ...body, fontSize: 11.5, color }}>
        ● {label}
        {meta.updatedByName && plan.status !== 'dirty' && (
          <span style={{ color: MUTED }}> • dernière modif. par {meta.updatedByName}</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => plan.save().then(() => toast.success('Plan enregistré'))}
        style={saveBtn}
      >Enregistrer</button>
    </div>
  );
}

function StatusBar({ hover, currentY, origin, dims, doc, floor }) {
  const world = hover ? toWorldCoords(origin, hover.x, currentY, hover.z) : null;
  const chests = doc.chests.filter((c) => c.y >= floor.yMin && c.y <= floor.yMax).length;
  return (
    <div style={{
      display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
      paddingTop: 8, ...mono, fontSize: 11, color: MUTED,
    }}>
      <span style={{ color: GOLD }}>
        {hover ? `local ${hover.x}, ${currentY}, ${hover.z}` : `gabarit ${dims.x}×${dims.z}`}
      </span>
      {world && <span>monde {world.x}, {world.y}, {world.z}</span>}
      <span>{floor.name || floor.id} · {chests} coffres sur l’étage</span>
      <span style={{ marginLeft: 'auto' }}>molette : zoom · clic droit / espace : déplacer</span>
    </div>
  );
}

function EmptyFloors() {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ ...body, fontSize: 13.5, color: INK }}>Ce plan n’a pas encore d’étage.</p>
      <p style={{ ...body, fontSize: 12, color: MUTED }}>
        Ajoute une tranche Y dans le panneau « Étages » à gauche : c’est la surface sur laquelle tu dessines.
      </p>
    </div>
  );
}

const pill = (on, big = false) => ({
  padding: big ? '8px 14px' : '5px 10px',
  borderRadius: big ? 10 : 999,
  cursor: 'pointer', ...body, fontSize: big ? 13 : 11.5, fontWeight: on ? 700 : 500,
  background: on ? (big ? GOLD : 'rgba(232,200,106,0.16)') : 'rgba(20,14,38,0.6)',
  color: on ? (big ? '#1a1206' : GOLD) : MUTED,
  border: on && !big ? '1px solid rgba(232,200,106,0.45)' : '1px solid rgba(80,50,130,0.28)',
});

const ghostBtn = {
  padding: '6px 11px', borderRadius: 8, cursor: 'pointer', ...body, fontSize: 12,
  background: 'transparent', border: '1px solid rgba(120,100,170,0.35)', color: INK,
};

const saveBtn = {
  padding: '7px 13px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12.5, fontWeight: 700,
  background: 'rgba(232,200,106,0.16)', border: '1px solid rgba(232,200,106,0.5)', color: GOLD,
};
