import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { searchBlocks } from '../../data/minecraftBlocks';
import {
  buildIconIndex, buildIdIndex, loadMinefieldCatalog, matchCatalogName, normName, searchCatalog,
} from '../../data/minefieldCatalog';
import { Block3D } from './block3d/Block3D';
import { useBlockThumbnail } from '../../hooks/useBlockThumbnail';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CraftCalculator } from './CraftCalculator';
import { BuildsView } from './builds/BuildsView';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import {
  ACC, ACC_RGB, Button, Empty, ErrorBanner, Field, Input, Modal, Section,
  Textarea, card, muted,
} from './shared';

// ── Domain constants ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'Minerais',   emoji: '⛏️' },
  { id: 'Bois',       emoji: '🌲' },
  { id: 'Pierre',     emoji: '🪨' },
  { id: 'Nourriture', emoji: '🍗' },
  { id: 'Combat',     emoji: '⚔️' },
  { id: 'Redstone',   emoji: '🔴' },
  { id: 'Magie',      emoji: '✨' },
  { id: 'Divers',     emoji: '🎒' },
];

export const RARITY_LIST = [
  { id: 'Commun',     color: 'rgba(156,163,175,0.85)' },
  { id: 'Peu commun', color: '#4ade80' },
  { id: 'Rare',       color: '#60a5fa' },
  { id: 'Épique',     color: '#c084fc' },
  { id: 'Légendaire', color: '#fb923c' },
];

const RARITY_ORDER = Object.fromEntries(RARITY_LIST.map((r, i) => [r.id, i]));

// Mondes pour les coffres (liste + champ libre côté formulaire).
export const WORLDS = [
  { id: 'overworld', label: 'Overworld', emoji: '🌳' },
  { id: 'nether',    label: 'Nether',    emoji: '🔥' },
  { id: 'end',       label: 'End',       emoji: '🌌' },
];
function worldMeta(world) {
  return WORLDS.find((w) => w.id === world) || { id: world, label: world || '—', emoji: '🗺️' };
}
function formatCoords(c) {
  if (c?.x == null && c?.y == null && c?.z == null) return null;
  return `${c.x ?? '?'} ${c.y ?? '?'} ${c.z ?? '?'}`;
}

const SORT_OPTIONS = [
  { id: 'name',     label: 'Trier par nom' },
  { id: 'quantity', label: 'Trier par quantité' },
  { id: 'rarity',   label: 'Trier par rareté' },
  { id: 'category', label: 'Trier par catégorie' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMOJI_KEYWORDS = [
  [['diamant'],                              '💎'],
  [['émeraude'],                             '💚'],
  [['lingot d\'or', 'minerai d\'or', 'nugget d\'or'], '🥇'],
  [['fer'],                                  '🔩'],
  [['charbon'],                              '⚫'],
  [['redstone'],                             '🔴'],
  [['lapis'],                                '🔵'],
  [['netherite'],                            '🔥'],
  [['cuivre'],                               '🟤'],
  [['quartz'],                               '⬜'],
  [['obsidienne'],                           '🟪'],
  [['débris', 'debris'],                     '💀'],
  [['planche', 'bûche'],                     '🪵'],
  [['pierre', 'granite', 'diorite', 'andésite', 'ardoise', 'tuf', 'calcite'], '🪨'],
  [['pain', 'blé', 'pomme', 'steak', 'porc', 'poulet', 'mouton', 'lapin', 'boeuf', 'carotte'], '🍖'],
  [['épée', 'hache', 'arc', 'arbalète', 'trident'], '⚔️'],
  [['armure', 'casque', 'plastron', 'jambières', 'bottes'], '🛡️'],
  [['perle', 'blaze'],                       '✨'],
  [['sable', 'gravier'],                     '🏖️'],
  [['laine'],                                '🐑'],
  [['verre'],                                '🪟'],
  [['améthyste'],                            '🔮'],
  [['slime'],                                '🟢'],
  [['os', 'poudre d\'os'],                  '🦴'],
];

export function getItemEmoji(name, category) {
  const lower = (name || '').toLowerCase();
  for (const [keywords, emoji] of EMOJI_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return emoji;
  }
  return CATEGORIES.find((c) => c.id === category)?.emoji ?? '📦';
}

export function rarityColor(rarity) {
  return RARITY_LIST.find((r) => r.id === rarity)?.color ?? 'rgba(156,163,175,0.85)';
}

export function stacksInfo(qty) {
  return {
    s64: Math.floor(qty / 64),
    rem: qty % 64,
    s16: Math.floor(qty / 16),
  };
}

// Icône d'un item : vraie texture Minefield (PNG pixel-art) si le nom correspond
// à une entrée du codex, sinon repli sur l'emoji déduit du nom/de la catégorie.
function ItemIcon({ name, category, iconIndex, idIndex, block3d = false, size = 24 }) {
  const url = iconIndex?.get(normName(name));
  const [hover, setHover] = useState(false);
  const id = block3d ? idIndex?.get(normName(name)) : null;
  // Vignette 3D statique permanente (renderer partagé, cache) — pas un contexte
  // WebGL par item.
  const thumb = useBlockThumbnail(id);

  const flat = url ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{ imageRendering: 'pixelated', objectFit: 'contain', display: 'block' }}
    />
  ) : (
    <span style={{ fontSize: size }}>{getItemEmoji(name, category)}</span>
  );

  // Sans modèle possible (pas d'id, ou mode 3D off) → comportement d'origine.
  if (!id) return flat;

  // Vignette 3D permanente (ou icône plate le temps du rendu), + rotation live au
  // survol. Retombe sur l'icône plate si l'id n'a pas de modèle géométrique.
  const base = thumb ? (
    <img src={thumb} alt="" width={size} height={size} draggable={false}
      style={{ imageRendering: 'pixelated', objectFit: 'contain', display: 'block' }} />
  ) : flat;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Survol : rotation 3D"
      style={{ position: 'relative', width: size, height: size, borderRadius: 8 }}
    >
      {base}
      {hover && <Block3D id={id} size={size} />}
    </div>
  );
}

// ── MinecraftTab — state + effects ────────────────────────────────────────────

export function MinecraftTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const confirm = useConfirm();
  const toast = useToast();
  useIsMobile(720); // reserved for future responsive tweaks

  // Data
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Catalogue Minefield (items/blocs custom + icônes), chargé une fois.
  const [catalog, setCatalog] = useState([]);
  const iconIndex = useMemo(() => buildIconIndex(catalog), [catalog]);
  const idIndex = useMemo(() => buildIdIndex(catalog), [catalog]);
  const [block3d, setBlock3d] = useState(true); // rendu 3D des blocs (défaut activé)
  const [calcOpen, setCalcOpen] = useState(false); // calculateur de craft
  // Deep-link : ?view=builds&build=<id> (ouvert depuis « Extraire la zone »).
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState(() => (initialQuery.get('view') === 'builds' ? 'builds' : 'chests')); // 'chests' | 'builds'
  const initialBuildId = Number(initialQuery.get('build')) || null;

  // Coffres (containers) + organisation de la vue
  const [chests, setChests] = useState([]);
  const [grouping, setGrouping] = useState('chest'); // 'chest' | 'all'
  const [collapsed, setCollapsed] = useState(() => new Set());

  // Item modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [addChestId, setAddChestId] = useState(null); // coffre présélectionné à l'ajout

  // Chest modal + screenshot modal
  const [chestModalOpen, setChestModalOpen] = useState(false);
  const [editingChest, setEditingChest] = useState(null);
  const [shotChest, setShotChest] = useState(null); // coffre cible du scan, ou null

  // Busy state for adjust buttons
  const [busyId, setBusyId] = useState(null);

  // UI filters / display
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [viewMode, setViewMode] = useState('grid');       // 'grid' | 'list'
  const [activeCategory, setActiveCategory] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);

  const load = async () => {
    try {
      const [its, chs] = await Promise.all([ws.minecraft.list(), ws.minecraft.chests.list()]);
      setItems(its); setChests(chs);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  useEffect(() => {
    let alive = true;
    loadMinefieldCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, []);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return;
    const fn = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [sortOpen]);

  // ── Computed stats ────────────────────────────────────────────────────────

  const totalUnits   = items.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalStacks64 = Math.floor(totalUnits / 64);
  const favCount     = items.filter((r) => r.favorite).length;
  const catCount     = new Set(items.map((r) => r.category).filter(Boolean)).size;

  // Per-category item counts (only categories that have items)
  const categoryTabs = useMemo(() => {
    const map = {};
    for (const r of items) {
      if (r.category) map[r.category] = (map[r.category] || 0) + 1;
    }
    return map;
  }, [items]);

  // Filtered + sorted list
  const displayed = useMemo(() => {
    let list = [...items];
    if (showFavOnly)    list = list.filter((r) => r.favorite);
    if (activeCategory) list = list.filter((r) => r.category === activeCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'name')     return a.name.localeCompare(b.name, 'fr');
      if (sortBy === 'quantity') return b.quantity - a.quantity;
      if (sortBy === 'rarity')   return (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0);
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '', 'fr');
      return 0;
    });
    return list;
  }, [items, showFavOnly, activeCategory, search, sortBy]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const adjust = async (id, delta) => {
    setBusyId(id);
    try {
      const updated = await ws.minecraft.adjust(id, delta);
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const toggleFav = async (r) => {
    try {
      const updated = await ws.minecraft.toggleFav(r.id);
      setItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    }
  };

  const remove = async (r) => {
    const ok = await confirm({
      title: `Supprimer « ${r.name} »`,
      message: 'Cette ressource sera retirée définitivement de la liste.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.remove(r.id);
      toast.success('Ressource supprimée');
      setItems((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    }
  };

  const handleSaved = (updated) => {
    setModalOpen(false);
    if (editing) {
      setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } else {
      setItems((prev) => [...prev, updated]);
    }
  };

  const openAddItem = (chestId = null) => { setEditing(null); setAddChestId(chestId); setModalOpen(true); };
  const openEditItem = (r) => { setEditing(r); setAddChestId(null); setModalOpen(true); };

  // ── Chests ──────────────────────────────────────────────────────────────────
  const handleChestSaved = (saved) => {
    setChestModalOpen(false); setEditingChest(null);
    setChests((prev) => (prev.some((c) => c.id === saved.id)
      ? prev.map((c) => (c.id === saved.id ? saved : c))
      : [...prev, saved]));
  };

  const removeChest = async (chest) => {
    const ok = await confirm({
      title: `Supprimer le coffre « ${chest.name} »`,
      message: 'Ses items repasseront en « Non rangé » (ils ne sont pas supprimés).',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.chests.remove(chest.id);
      setChests((prev) => prev.filter((c) => c.id !== chest.id));
      setItems((prev) => prev.map((r) => (r.chestId === chest.id ? { ...r, chestId: null } : r)));
      toast.success('Coffre supprimé');
    } catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  const handleApplied = (updatedList) => {
    setShotChest(null);
    setItems(updatedList);
    toast.success('Coffre mis à jour');
  };

  const toggleCollapse = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Items (déjà filtrés/triés) regroupés par coffre. chestId null → « Non rangé ».
  const itemsByChest = useMemo(() => {
    const m = new Map();
    for (const r of displayed) {
      const key = r.chestId ?? 'none';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return m;
  }, [displayed]);

  const filtering = !!(search.trim() || activeCategory || showFavOnly);
  // En mode « par coffre » : tous les coffres si pas de filtre, sinon seulement
  // ceux qui ont des items correspondants.
  const visibleChests = filtering
    ? chests.filter((c) => (itemsByChest.get(c.id) || []).length > 0)
    : chests;
  const unsorted = itemsByChest.get('none') || [];

  const itemHandlers = {
    iconIndex, idIndex, block3d, viewMode,
    busyIdOf: (id) => busyId === id,
    onAdjust: adjust,
    onEdit: openEditItem,
    onRemove: remove,
    onToggleFav: toggleFav,
  };

  // ── Render (see bottom of file) ───────────────────────────────────────────
  const subtitle = `${items.length} item${items.length > 1 ? 's' : ''} · ${totalUnits} unité${totalUnits > 1 ? 's' : ''} · ${chests.length} coffre${chests.length > 1 ? 's' : ''}`;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Trier';

  const subNav = <MinecraftSubNav view={view} setView={setView} />;
  // Lien vers le journal de quêtes global (Nostra/Minefield) — vit ici plutôt
  // que dans le footer du site public.
  const questsLink = <QuestsLink />;

  if (view === 'builds') {
    return (
      <Section
        title="🏗️ Builds 3D importés"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {questsLink}
            {subNav}
          </div>
        }
      >
        <BuildsView ws={ws} slug={workspace.slug} items={items} chests={chests} initialOpenId={initialBuildId} />
      </Section>
    );
  }

  return (
    <Section
      title="⛏️ Ressources Minecraft"
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {questsLink}
          {subNav}
          <Button variant="ghost" onClick={() => setCalcOpen(true)}>🧮 Calculateur</Button>
          <Button variant="ghost" onClick={() => { setEditingChest(null); setChestModalOpen(true); }}>
            + Coffre
          </Button>
          <Button onClick={() => openAddItem(null)}>+ Item</Button>
        </div>
      }
    >
      {(items.length > 0 || chests.length > 0) && (
        <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 16 }}>{subtitle}</p>
      )}
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {/* ── Ressources wanted (wishlist du projet, triée par priorité) ── */}
      {!loading && (
        <WantedPanel
          ws={ws} slug={workspace.slug} items={items} catalog={catalog}
          iconIndex={iconIndex} idIndex={idIndex} block3d={block3d}
          toast={toast} confirm={confirm}
        />
      )}

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 && chests.length === 0 ? (
        <Empty>Aucune ressource. Crée un coffre ou ajoute un item pour commencer (ex. Diamants, Obsidienne, Bois…).</Empty>
      ) : (
        <>
          {/* ── Stats ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label="ITEMS"      value={items.length} />
            <StatCard label="TOTAL"      value={totalUnits}    unit="unités" />
            <StatCard label="STACKS×64"  value={totalStacks64} accent="#4ade80" />
            <StatCard label="COFFRES"    value={chests.length} accent="#c084fc" />
            <StatCard label="FAVORIS"    value={favCount}      accent="#fb923c" />
            <StatCard label="CATÉGORIES" value={catCount} />
          </div>

          {/* ── Search + Sort ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <span style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(180,170,200,0.4)', fontSize: 13, pointerEvents: 'none',
              }}>🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un item..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(14,9,28,0.6)',
                  border: '1px solid rgba(80,50,130,0.28)',
                  borderRadius: 10, padding: '9px 12px 9px 32px',
                  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
            <div ref={sortRef} style={{ position: 'relative' }}>
              <button type="button"
                onClick={() => setSortOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(14,9,28,0.6)',
                  border: '1px solid rgba(80,50,130,0.28)',
                  borderRadius: 10, padding: '9px 14px',
                  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {currentSortLabel}
                <span style={{ fontSize: 10, opacity: 0.55 }}>⌄</span>
              </button>
              {sortOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                  background: '#0f0a24', border: '1px solid rgba(80,50,130,0.3)',
                  borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
                  padding: 6, minWidth: 200,
                }}>
                  {SORT_OPTIONS.map((o) => (
                    <button type="button"
                      key={o.id}
                      onClick={() => { setSortBy(o.id); setSortOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '10px 14px', borderRadius: 8, border: 'none',
                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                        color: sortBy === o.id ? ACC : '#ede8f8',
                        fontFamily: "'Inter',sans-serif", fontSize: 14,
                      }}
                    >
                      <span style={{ width: 16, fontSize: 12 }}>{sortBy === o.id ? '✓' : ''}</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Grouping + Favoris toggle + view mode ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(80,50,130,0.28)',
            }}>
              {[['chest', '📦 Par coffre'], ['all', '☰ Tout']].map(([mode, label], i) => (
                <button type="button"
                  key={mode}
                  onClick={() => setGrouping(mode)}
                  style={{
                    padding: '7px 12px', border: 'none',
                    borderLeft: i > 0 ? '1px solid rgba(80,50,130,0.28)' : 'none',
                    background: grouping === mode ? `rgba(${ACC_RGB},0.22)` : 'transparent',
                    cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                    color: grouping === mode ? ACC : 'rgba(180,170,200,0.55)',
                    fontFamily: "'Inter',sans-serif",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button"
              onClick={() => setShowFavOnly((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                background: showFavOnly ? `rgba(${ACC_RGB},0.18)` : 'transparent',
                border: `1px solid ${showFavOnly ? ACC : 'rgba(80,50,130,0.28)'}`,
                color: showFavOnly ? ACC : '#ede8f8',
                fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
              }}
            >
              ⭐ Favoris
            </button>
            <button type="button"
              onClick={() => setBlock3d((v) => !v)}
              title="Aperçu 3D des blocs au survol (l'icône plate reste par défaut)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                background: block3d ? `rgba(${ACC_RGB},0.18)` : 'transparent',
                border: `1px solid ${block3d ? ACC : 'rgba(80,50,130,0.28)'}`,
                color: block3d ? ACC : '#ede8f8',
                fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
              }}
            >
              🧊 3D
            </button>
            <div style={{
              display: 'flex', borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(80,50,130,0.28)',
            }}>
              {['grid', 'list'].map((mode, i) => (
                <button type="button"
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={mode === 'grid' ? 'Vue grille' : 'Vue liste'}
                  style={{
                    padding: '7px 12px', border: 'none',
                    borderLeft: i > 0 ? '1px solid rgba(80,50,130,0.28)' : 'none',
                    background: viewMode === mode ? `rgba(${ACC_RGB},0.22)` : 'transparent',
                    cursor: 'pointer', fontSize: 16,
                    color: viewMode === mode ? ACC : 'rgba(180,170,200,0.45)',
                  }}
                >
                  {mode === 'grid' ? '⊞' : '≡'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Category tabs ── */}
          {Object.keys(categoryTabs).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <CategoryTab
                active={activeCategory === ''}
                onClick={() => setActiveCategory('')}
                emoji="📦" label="Tout" count={items.length}
              />
              {CATEGORIES.filter((c) => categoryTabs[c.id]).map((c) => (
                <CategoryTab
                  key={c.id}
                  active={activeCategory === c.id}
                  onClick={() => setActiveCategory(c.id)}
                  emoji={c.emoji} label={c.id} count={categoryTabs[c.id]}
                />
              ))}
            </div>
          )}

          {/* ── Items : par coffre ou liste plate ── */}
          {grouping === 'all' ? (
            displayed.length === 0 ? (
              <Empty>Aucun item ne correspond aux filtres.</Empty>
            ) : (
              <ItemCollection items={displayed} {...itemHandlers} />
            )
          ) : (visibleChests.length === 0 && unsorted.length === 0) ? (
            <Empty>
              {filtering
                ? 'Aucun item ne correspond aux filtres.'
                : 'Aucun coffre. Clique « + Coffre » pour en créer un, ou « + Item » pour ajouter sans le ranger.'}
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {visibleChests.map((chest) => (
                <ChestPanel
                  key={chest.id}
                  chest={chest}
                  items={itemsByChest.get(chest.id) || []}
                  collapsed={collapsed.has(chest.id)}
                  onToggle={() => toggleCollapse(chest.id)}
                  onAddItem={() => openAddItem(chest.id)}
                  onEditChest={() => { setEditingChest(chest); setChestModalOpen(true); }}
                  onDeleteChest={() => removeChest(chest)}
                  onScan={() => setShotChest(chest)}
                  itemHandlers={itemHandlers}
                />
              ))}
              {unsorted.length > 0 && (
                <ChestPanel
                  unsortedGroup
                  items={unsorted}
                  collapsed={collapsed.has('none')}
                  onToggle={() => toggleCollapse('none')}
                  onAddItem={() => openAddItem(null)}
                  itemHandlers={itemHandlers}
                />
              )}
            </div>
          )}
        </>
      )}

      <ResourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        ws={ws}
        catalog={catalog}
        chests={chests}
        initialChestId={addChestId}
        onSaved={handleSaved}
        onError={(e) => setErr(e.message)}
        toast={toast}
      />

      <ChestModal
        open={chestModalOpen}
        onClose={() => { setChestModalOpen(false); setEditingChest(null); }}
        editing={editingChest}
        ws={ws}
        onSaved={handleChestSaved}
        toast={toast}
      />

      <Modal open={calcOpen} onClose={() => setCalcOpen(false)} title="🧮 Calculateur de craft" width={760}>
        <CraftCalculator
          items={items}
          chests={chests}
          ws={ws}
          toast={toast}
          onApplied={(updated) => { setItems(updated); }}
        />
      </Modal>

      <ScreenshotModal
        chest={shotChest}
        onClose={() => setShotChest(null)}
        ws={ws}
        catalog={catalog}
        iconIndex={iconIndex}
        onApplied={handleApplied}
        toast={toast}
      />

      <p style={{
        ...muted, fontSize: 11, marginTop: 28, textAlign: 'center',
        opacity: 0.65,
      }}>
        Objets et textures © serveur Minefield
      </p>
    </Section>
  );
}

// ── Lien vers le journal de quêtes (/quetes) ──────────────────────────────────

function QuestsLink() {
  return (
    <Link
      to="/quetes"
      title="Journal de quêtes Nostra / Minefield"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderRadius: 8, textDecoration: 'none',
        background: 'rgba(232,200,106,0.08)', border: '1px solid rgba(232,200,106,0.4)',
        color: '#e8c86a', fontFamily: "'Inter',sans-serif", fontSize: 13, whiteSpace: 'nowrap',
      }}
    >
      📜 Quêtes
    </Link>
  );
}

// ── Sous-navigation Coffres / Builds 3D ───────────────────────────────────────

function MinecraftSubNav({ view, setView }) {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(80,50,130,0.28)' }}>
      {[['chests', '📦 Coffres'], ['builds', '🏗️ Builds 3D']].map(([k, label], i) => (
        <button type="button" key={k} onClick={() => setView(k)}
          style={{
            padding: '7px 12px', border: 'none',
            borderLeft: i > 0 ? '1px solid rgba(80,50,130,0.28)' : 'none',
            background: view === k ? `rgba(${ACC_RGB},0.22)` : 'transparent',
            cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
            color: view === k ? ACC : 'rgba(180,170,200,0.6)',
            fontFamily: "'Inter',sans-serif",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, accent }) {
  return (
    <div style={{
      ...card, padding: '12px 16px',
      flex: '1 1 76px', minWidth: 76,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ ...muted, fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: accent ?? '#ede8f8', lineHeight: 1,
        }}>
          {value}
        </span>
        {unit && <span style={{ ...muted, fontSize: 11 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── CategoryTab ───────────────────────────────────────────────────────────────

function CategoryTab({ active, onClick, emoji, label, count }) {
  return (
    <button type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20,
        background: active ? 'rgba(120,80,180,0.32)' : 'rgba(14,9,28,0.5)',
        border: `1px solid ${active ? 'rgba(160,100,240,0.55)' : 'rgba(80,50,130,0.28)'}`,
        color: active ? '#ede8f8' : 'rgba(180,170,200,0.6)',
        fontFamily: "'Inter',sans-serif", fontSize: 13,
        fontWeight: active ? 600 : 400, cursor: 'pointer',
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span style={{
        background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
        borderRadius: 10, padding: '1px 7px', fontSize: 11,
        color: active ? '#ede8f8' : 'rgba(180,170,200,0.45)',
      }}>{count}</span>
    </button>
  );
}

// ── AdjustButton (shared between grid + list) ─────────────────────────────────

function AdjBtn({ delta, label, busy, onAdjust, compact = false }) {
  const neg = delta < 0;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAdjust(delta)}
      style={{
        padding: compact ? '5px 8px' : '6px 10px',
        borderRadius: 8, border: 'none',
        background: neg ? 'rgba(220,60,60,0.15)' : 'rgba(60,200,120,0.12)',
        color: neg ? '#f87171' : '#4ade80',
        fontFamily: "'Inter',sans-serif",
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.5 : 1,
        minWidth: compact ? 34 : 38,
      }}
    >
      {label}
    </button>
  );
}

// ── ItemCard (grid view) ──────────────────────────────────────────────────────

function ItemCard({ r, busy, iconIndex, idIndex, block3d, onAdjust, onEdit, onRemove, onToggleFav }) {
  const cat    = CATEGORIES.find((c) => c.id === r.category);
  const rColor = rarityColor(r.rarity);
  const { s64, rem, s16 } = stacksInfo(r.quantity);

  return (
    <div style={{ ...card }}>
      {/* ── Header: icon · name+tags · fav star ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10, flexShrink: 0,
          background: 'rgba(20,10,42,0.85)',
          border: '1px solid rgba(80,50,130,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ItemIcon name={r.name} category={r.category} iconIndex={iconIndex} idIndex={idIndex} block3d={block3d} size={32} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
            color: '#ede8f8', marginBottom: 6,
          }}>
            {r.name}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cat && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 12,
                background: 'rgba(120,80,180,0.18)',
                border: '1px solid rgba(120,80,180,0.35)',
                color: 'rgba(200,180,240,0.85)', fontSize: 11,
                fontFamily: "'Inter',sans-serif",
              }}>
                {cat.emoji} {r.category}
              </span>
            )}
            <span style={{
              padding: '2px 8px', borderRadius: 12,
              background: `${rColor}1a`,
              border: `1px solid ${rColor}55`,
              color: rColor, fontSize: 11,
              fontFamily: "'Inter',sans-serif",
            }}>
              {r.rarity}
            </span>
          </div>
        </div>
        <button type="button"
          onClick={onToggleFav}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 22, lineHeight: 1, padding: 0, flexShrink: 0,
            color: r.favorite ? '#fb923c' : 'rgba(180,170,200,0.28)',
          }}
        >
          {r.favorite ? '★' : '☆'}
        </button>
      </div>

      {/* ── Quantity ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 38, fontWeight: 800,
            color: '#4dd9ac', lineHeight: 1,
          }}>
            {r.quantity}
          </span>
          <span style={{ ...muted, fontSize: 13 }}>unités</span>
        </div>
        {r.quantity > 0 && (
          <div style={{ ...muted, fontSize: 12, marginTop: 3 }}>
            {s64} stacks·64 + {rem}&nbsp; / {s16} stacks·16
          </div>
        )}
      </div>

      {/* ── Adjust buttons ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        <AdjBtn delta={-64} label="−64" busy={busy} onAdjust={onAdjust} />
        <AdjBtn delta={-16} label="−16" busy={busy} onAdjust={onAdjust} />
        <AdjBtn delta={-1}  label="−1"  busy={busy} onAdjust={onAdjust} />
        <AdjBtn delta={+1}  label="+1"  busy={busy} onAdjust={onAdjust} />
        <AdjBtn delta={+16} label="+16" busy={busy} onAdjust={onAdjust} />
        <AdjBtn delta={+64} label="+64" busy={busy} onAdjust={onAdjust} />
      </div>

      {/* ── Note ── */}
      {r.notes && (
        <div style={{ ...muted, fontSize: 12, fontStyle: 'italic', marginBottom: 12 }}>
          💬 {r.notes}
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button"
          onClick={onEdit}
          style={{
            flex: 1, padding: '9px', borderRadius: 8,
            background: 'rgba(80,50,130,0.16)',
            border: '1px solid rgba(80,50,130,0.3)',
            color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
          }}
        >
          ✏️ Modifier
        </button>
        <button type="button"
          onClick={onRemove}
          style={{
            flex: 1, padding: '9px', borderRadius: 8,
            background: 'rgba(200,50,50,0.1)',
            border: '1px solid rgba(200,50,50,0.25)',
            color: '#f87171', fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
          }}
        >
          🗑️ Supprimer
        </button>
      </div>
    </div>
  );
}

// ── ItemRow (list view) ───────────────────────────────────────────────────────

function ItemRow({ r, busy, iconIndex, idIndex, block3d, onAdjust, onEdit, onRemove, onToggleFav }) {
  const cat   = CATEGORIES.find((c) => c.id === r.category);

  return (
    <div style={{
      ...card, padding: '12px 14px',
      borderLeft: '3px solid rgba(120,80,180,0.45)',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      {/* Icon + name + tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 160px', minWidth: 0 }}>
        <span style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(20,10,42,0.85)', borderRadius: 6,
        }}>
          <ItemIcon name={r.name} category={r.category} iconIndex={iconIndex} idIndex={idIndex} block3d={block3d} size={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
            color: '#ede8f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {r.name}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
            {cat && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 10,
                background: 'rgba(120,80,180,0.18)',
                border: '1px solid rgba(120,80,180,0.35)',
                color: 'rgba(200,180,240,0.85)', fontSize: 10,
                fontFamily: "'Inter',sans-serif",
              }}>
                {cat.emoji} {r.category}
              </span>
            )}
            <span style={{
              padding: '1px 6px', borderRadius: 10,
              background: `${rarityColor(r.rarity)}1a`,
              border: `1px solid ${rarityColor(r.rarity)}55`,
              color: rarityColor(r.rarity), fontSize: 10,
              fontFamily: "'Inter',sans-serif",
            }}>
              {r.rarity}
            </span>
          </div>
        </div>
      </div>

      {/* Controls inline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <AdjBtn delta={-64} label="−64" busy={busy} onAdjust={onAdjust} compact />
        <AdjBtn delta={-1}  label="−1"  busy={busy} onAdjust={onAdjust} compact />
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
          color: '#4dd9ac', minWidth: 44, textAlign: 'center',
        }}>
          {r.quantity}
        </span>
        <AdjBtn delta={+1}  label="+1"  busy={busy} onAdjust={onAdjust} compact />
        <AdjBtn delta={+64} label="+64" busy={busy} onAdjust={onAdjust} compact />

        <button type="button"
          onClick={onToggleFav}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, padding: '3px 4px',
            color: r.favorite ? '#fb923c' : 'rgba(180,170,200,0.28)',
          }}
        >
          {r.favorite ? '★' : '☆'}
        </button>
        <button type="button"
          onClick={onEdit}
          style={{
            background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
            color: '#ede8f8', borderRadius: 6, padding: '5px 8px',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          ✏️
        </button>
        <button type="button"
          onClick={onRemove}
          style={{
            background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)',
            color: '#f87171', borderRadius: 6, padding: '5px 8px',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── ItemCollection (grid/list of items, reused flat + per chest) ──────────────

function ItemCollection({ items, viewMode, iconIndex, idIndex, block3d, busyIdOf, onAdjust, onEdit, onRemove, onToggleFav }) {
  const Comp = viewMode === 'grid' ? ItemCard : ItemRow;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'grid' ? 12 : 8 }}>
      {items.map((r) => (
        <Comp
          key={r.id} r={r} busy={busyIdOf(r.id)} iconIndex={iconIndex}
          idIndex={idIndex} block3d={block3d}
          onAdjust={(d) => onAdjust(r.id, d)}
          onEdit={() => onEdit(r)}
          onRemove={() => onRemove(r)}
          onToggleFav={() => onToggleFav(r)}
        />
      ))}
    </div>
  );
}

// ── ChestPanel (un coffre repliable + ses items ; ou le groupe « Non rangé ») ──

function PanelBtn({ onClick, title, danger, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        background: danger ? 'rgba(200,50,50,0.1)' : 'rgba(80,50,130,0.16)',
        border: `1px solid ${danger ? 'rgba(200,50,50,0.25)' : 'rgba(80,50,130,0.3)'}`,
        color: danger ? '#f87171' : '#ede8f8',
        borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 13, lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function ChestPanel({
  chest, unsortedGroup, items, collapsed, onToggle,
  onAddItem, onEditChest, onDeleteChest, onScan, itemHandlers,
}) {
  const meta = unsortedGroup ? { emoji: '📦', label: 'Non rangé' } : worldMeta(chest.world);
  const coords = unsortedGroup ? null : formatCoords(chest);
  const total = items.reduce((s, r) => s + (r.quantity || 0), 0);

  return (
    <div style={{
      border: '1px solid rgba(80,50,130,0.24)', borderRadius: 12,
      background: 'rgba(14,9,28,0.45)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onToggle} title={collapsed ? 'Déplier' : 'Replier'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'rgba(180,170,200,0.7)', fontSize: 12, width: 16,
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span style={{ fontSize: 20 }}>{unsortedGroup ? '📦' : '🧰'}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8',
            }}>
              {unsortedGroup ? 'Non rangé' : chest.name}
            </span>
            {!unsortedGroup && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '1px 8px', borderRadius: 12, fontSize: 11,
                background: 'rgba(120,80,180,0.18)', border: '1px solid rgba(120,80,180,0.35)',
                color: 'rgba(200,180,240,0.85)', fontFamily: "'Inter',sans-serif",
              }}>
                {meta.emoji} {meta.label}
              </span>
            )}
            {coords && (
              <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace' }}>⛏ {coords}</span>
            )}
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>
            {items.length} item{items.length > 1 ? 's' : ''} · {total} unité{total > 1 ? 's' : ''}
            {!unsortedGroup && chest.note ? ` · ${chest.note}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!unsortedGroup && <PanelBtn onClick={onScan} title="Mettre à jour depuis un screenshot">📷</PanelBtn>}
          <PanelBtn onClick={onAddItem} title="Ajouter un item">＋</PanelBtn>
          {!unsortedGroup && <PanelBtn onClick={onEditChest} title="Éditer le coffre">✏️</PanelBtn>}
          {!unsortedGroup && <PanelBtn onClick={onDeleteChest} title="Supprimer le coffre" danger>🗑️</PanelBtn>}
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 14px 14px' }}>
          {items.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, padding: '4px 0 2px' }}>Coffre vide.</p>
          ) : (
            <ItemCollection items={items} {...itemHandlers} />
          )}
        </div>
      )}
    </div>
  );
}

// ── WantedPanel (ressources recherchées, triées par priorité) ─────────────────
// Wishlist du projet : chaque ligne vise une quantité ; la progression est
// calculée depuis l'inventaire (toutes lignes/coffres confondus) et on coche
// quand la quantité voulue est récupérée.

export const WANTED_PRIORITIES = [
  { id: 1, label: 'Haute',   emoji: '🔥', color: '#f87171' },
  { id: 2, label: 'Moyenne', emoji: '⚡', color: '#fbbf24' },
  { id: 3, label: 'Basse',   emoji: '🌙', color: '#60a5fa' },
];
const priorityMeta = (p) => WANTED_PRIORITIES.find((x) => x.id === p) ?? WANTED_PRIORITIES[1];

const WANTED_ACC = '#fb923c'; // orange « wanted poster », distinct du violet des coffres

function WantedPanel({ ws, slug, items, catalog, iconIndex, idIndex, block3d, toast, confirm }) {
  const [wanted, setWanted] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Formulaire (ajout / édition inline)
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(64);
  const [priority, setPriority] = useState(2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    ws.minecraft.wanted.list()
      .then((l) => { if (alive) setWanted(l); })
      .catch((e) => { if (alive) toast.error(`Wanted : ${e.message}`); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [slug]);

  // Inventaire courant par nom normalisé (pour la progression possédé/voulu).
  const haveByName = useMemo(() => {
    const m = new Map();
    for (const r of items) {
      const k = normName(r.name);
      m.set(k, (m.get(k) || 0) + (r.quantity || 0));
    }
    return m;
  }, [items]);

  const sorted = useMemo(() => [...wanted].sort((a, b) => (
    (a.done - b.done) || (a.priority - b.priority) || (a.position - b.position) || (a.id - b.id)
  )), [wanted]);
  const remaining = wanted.filter((w) => !w.done).length;

  const openAdd = () => { setEditing(null); setName(''); setQuantity(64); setPriority(2); setFormOpen(true); };
  const openEdit = (w) => { setEditing(w); setName(w.name); setQuantity(w.quantity); setPriority(w.priority); setFormOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), quantity: Math.max(1, Number(quantity) || 1), priority };
      const saved = editing
        ? await ws.minecraft.wanted.update(editing.id, payload)
        : await ws.minecraft.wanted.create(payload);
      setWanted((prev) => (editing ? prev.map((w) => (w.id === saved.id ? saved : w)) : [...prev, saved]));
      setFormOpen(false); setEditing(null);
      toast.success(editing ? 'Ressource wanted mise à jour' : 'Ajoutée à la liste wanted');
    } catch (ex) {
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (w) => {
    try {
      const updated = await ws.minecraft.wanted.toggleDone(w.id);
      setWanted((prev) => prev.map((x) => (x.id === w.id ? updated : x)));
    } catch (ex) { toast.error(`Échec : ${ex.message}`); }
  };

  const remove = async (w) => {
    const ok = await confirm({
      title: `Retirer « ${w.name} »`,
      message: 'Cette ressource sera retirée de la liste wanted.',
      confirmLabel: 'Retirer', danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.wanted.remove(w.id);
      setWanted((prev) => prev.filter((x) => x.id !== w.id));
      toast.success('Retirée de la liste');
    } catch (ex) { toast.error(`Échec : ${ex.message}`); }
  };

  return (
    <div style={{
      border: '1px solid rgba(251,146,60,0.32)', borderRadius: 12,
      background: 'linear-gradient(180deg, rgba(60,32,10,0.28), rgba(14,9,28,0.45))',
      overflow: 'hidden', marginBottom: 16,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Déplier' : 'Replier'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'rgba(251,190,120,0.8)', fontSize: 12, width: 16,
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span style={{ fontSize: 20 }}>🎯</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ffe6c9' }}>
              Ressources wanted
            </span>
            <span style={{
              padding: '1px 8px', borderRadius: 12, fontSize: 11,
              background: 'rgba(251,146,60,0.16)', border: '1px solid rgba(251,146,60,0.4)',
              color: WANTED_ACC, fontFamily: "'Inter',sans-serif",
            }}>
              {remaining} à récupérer
            </span>
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>
            Triées par priorité — coche quand la quantité voulue est récupérée.
          </div>
        </div>
        <button type="button" onClick={openAdd}
          style={{
            background: 'rgba(251,146,60,0.14)', border: '1px solid rgba(251,146,60,0.45)',
            color: WANTED_ACC, borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          ＋ Wanted
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* ── Formulaire inline (ajout / édition) ── */}
          {formOpen && (
            <form onSubmit={submit} style={{
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
              padding: 10, borderRadius: 10, marginBottom: 10,
              background: 'rgba(20,10,42,0.55)', border: '1px dashed rgba(251,146,60,0.4)',
            }}>
              <div style={{ flex: '2 1 200px', minWidth: 180 }}>
                <BlockPicker value={name} onChange={setName} catalog={catalog} autoFocus />
              </div>
              <input
                type="number" min="1" value={quantity} title="Quantité voulue"
                onChange={(e) => setQuantity(e.target.value)}
                style={{
                  width: 84, boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
                  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
                  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {WANTED_PRIORITIES.map((p) => {
                  const active = priority === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                      title={`Priorité ${p.label.toLowerCase()}`}
                      style={{
                        padding: '6px 10px', borderRadius: 14,
                        background: active ? `${p.color}22` : 'rgba(20,12,40,0.6)',
                        border: `1px solid ${active ? p.color : 'rgba(80,50,130,0.3)'}`,
                        color: active ? p.color : 'rgba(180,170,200,0.7)',
                        fontFamily: "'Inter',sans-serif", fontSize: 12,
                        fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {p.emoji} {p.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? '…' : (editing ? 'Enregistrer' : 'Ajouter')}
                </Button>
                <Button type="button" variant="ghost" disabled={saving}
                  onClick={() => { setFormOpen(false); setEditing(null); }}>
                  Annuler
                </Button>
              </div>
            </form>
          )}

          {/* ── Lignes ── */}
          {!loaded ? (
            <p style={{ ...muted, fontSize: 12.5, padding: '4px 0 2px' }}>Chargement…</p>
          ) : sorted.length === 0 ? (
            !formOpen && (
              <p style={{ ...muted, fontSize: 12.5, padding: '4px 0 2px' }}>
                Aucune ressource recherchée. Clique « ＋ Wanted » pour en ajouter une.
              </p>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map((w) => {
                const p = priorityMeta(w.priority);
                const have = haveByName.get(normName(w.name)) || 0;
                const ratio = w.quantity > 0 ? Math.min(1, have / w.quantity) : 0;
                const ready = !w.done && have >= w.quantity;
                return (
                  <div key={w.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: '9px 12px', borderRadius: 10,
                    background: w.done ? 'rgba(14,9,28,0.35)' : 'rgba(20,10,42,0.6)',
                    border: `1px solid ${w.done ? 'rgba(80,50,130,0.18)' : ready ? 'rgba(74,222,128,0.5)' : `${p.color}44`}`,
                    borderLeft: `3px solid ${w.done ? 'rgba(80,50,130,0.3)' : p.color}`,
                    opacity: w.done ? 0.55 : 1,
                  }}>
                    {/* Coche « récupéré » */}
                    <button type="button" onClick={() => toggleDone(w)}
                      title={w.done ? 'Décocher (à re-récupérer)' : 'Cocher : quantité récupérée'}
                      style={{
                        width: 24, height: 24, flexShrink: 0, borderRadius: 7, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: w.done ? 'rgba(74,222,128,0.18)' : ready ? 'rgba(74,222,128,0.12)' : 'rgba(14,9,28,0.6)',
                        border: `1px solid ${w.done || ready ? '#4ade80' : 'rgba(120,80,180,0.45)'}`,
                        color: '#4ade80', fontSize: 14, lineHeight: 1, padding: 0,
                      }}
                    >
                      {w.done ? '✓' : ready ? <span style={{ opacity: 0.4 }}>✓</span> : ''}
                    </button>

                    <span style={{
                      width: 30, height: 30, flexShrink: 0, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(20,10,42,0.85)',
                    }}>
                      <ItemIcon name={w.name} iconIndex={iconIndex} idIndex={idIndex} block3d={block3d} size={20} />
                    </span>

                    <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
                        color: w.done ? 'rgba(180,170,200,0.6)' : '#ede8f8',
                        textDecoration: w.done ? 'line-through' : 'none',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {w.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '1px 7px', borderRadius: 10, fontSize: 10,
                          background: `${p.color}1a`, border: `1px solid ${p.color}55`,
                          color: p.color, fontFamily: "'Inter',sans-serif",
                        }}>
                          {p.emoji} {p.label}
                        </span>
                        {ready && (
                          <span style={{
                            padding: '1px 7px', borderRadius: 10, fontSize: 10,
                            background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.5)',
                            color: '#4ade80', fontFamily: "'Inter',sans-serif",
                          }}>
                            ✅ Quantité atteinte
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progression possédé / voulu */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ width: 90, height: 6, borderRadius: 4, background: 'rgba(14,9,28,0.8)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.round(ratio * 100)}%`, height: '100%', borderRadius: 4,
                          background: w.done || ready ? '#4ade80' : p.color,
                          transition: 'width 0.25s',
                        }} />
                      </div>
                      <span style={{
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                        color: w.done || ready ? '#4ade80' : '#ede8f8', whiteSpace: 'nowrap',
                      }}>
                        {have}<span style={{ ...muted, fontWeight: 400 }}> / {w.quantity}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button type="button" onClick={() => openEdit(w)} title="Modifier"
                        style={{
                          background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
                          color: '#ede8f8', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                        }}
                      >
                        ✏️
                      </button>
                      <button type="button" onClick={() => remove(w)} title="Retirer"
                        style={{
                          background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)',
                          color: '#f87171', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ResourceModal ─────────────────────────────────────────────────────────────

function ResourceModal({ open, onClose, editing, ws, catalog, chests = [], initialChestId = null, onSaved, onError, toast }) {
  const isEdit = !!editing;
  const [name,     setName]     = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes,    setNotes]    = useState('');
  const [category, setCategory] = useState('');
  const [rarity,   setRarity]   = useState('Commun');
  const [chestId,  setChestId]  = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name     ?? '');
    setQuantity(editing?.quantity ?? 0);
    setNotes(editing?.notes    ?? '');
    setCategory(editing?.category ?? '');
    setRarity(editing?.rarity   ?? 'Commun');
    setChestId(editing?.chestId ?? initialChestId ?? '');
  }, [open, editing, initialChestId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        quantity: Number(quantity) || 0,
        notes: notes.trim(),
        category,
        rarity,
        chestId: chestId === '' ? null : Number(chestId),
      };
      const updated = isEdit
        ? await ws.minecraft.update(editing.id, payload)
        : await ws.minecraft.create(payload);
      toast.success(isEdit ? 'Ressource mise à jour' : 'Ressource ajoutée');
      onSaved(updated);
    } catch (ex) {
      onError(ex);
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '✏️ Modifier' : '+ Ajouter un item'}
      width={520}
    >
      <form onSubmit={submit}>
        {/* Name */}
        <Field label="NOM DE L'ITEM">
          <BlockPicker value={name} onChange={setName} catalog={catalog} autoFocus />
        </Field>

        {/* Quantity */}
        <Field label="QUANTITÉ">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 80px' }}>
              <Input
                type="number" min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            {[1, 8, 16, 32, 64].map((n) => (
              <button
                key={n} type="button"
                onClick={() => setQuantity((v) => Math.max(0, Number(v) + n))}
                style={{
                  padding: '7px 10px', borderRadius: 8,
                  background: `rgba(${ACC_RGB},0.12)`,
                  border: `1px solid rgba(${ACC_RGB},0.35)`,
                  color: ACC, fontFamily: "'Inter',sans-serif",
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                +{n}
              </button>
            ))}
          </div>
        </Field>

        {/* Chest */}
        <Field label="COFFRE">
          <select
            value={chestId}
            onChange={(e) => setChestId(e.target.value === '' ? '' : Number(e.target.value))}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)',
              borderRadius: 8, padding: '9px 12px', color: '#ede8f8',
              fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
            }}
          >
            <option value="">📦 Non rangé</option>
            {chests.map((c) => (
              <option key={c.id} value={c.id}>{worldMeta(c.world).emoji} {c.name}</option>
            ))}
          </select>
        </Field>

        {/* Category chips */}
        <Field label="CATÉGORIE">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id} type="button"
                  onClick={() => setCategory((v) => v === c.id ? '' : c.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 16,
                    background: active ? `rgba(${ACC_RGB},0.2)` : 'rgba(20,12,40,0.6)',
                    border: `1px solid ${active ? ACC : 'rgba(80,50,130,0.3)'}`,
                    color: active ? ACC : 'rgba(180,170,200,0.7)',
                    fontFamily: "'Inter',sans-serif", fontSize: 13,
                    fontWeight: active ? 600 : 400, cursor: 'pointer',
                  }}
                >
                  {c.emoji} {c.id}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Rarity chips */}
        <Field label="RARETÉ">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RARITY_LIST.map((r) => {
              const active = rarity === r.id;
              return (
                <button
                  key={r.id} type="button"
                  onClick={() => setRarity(r.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 16,
                    background: active ? `${r.color}22` : 'rgba(20,12,40,0.6)',
                    border: `1px solid ${active ? r.color : 'rgba(80,50,130,0.3)'}`,
                    color: active ? r.color : 'rgba(180,170,200,0.7)',
                    fontFamily: "'Inter',sans-serif", fontSize: 13,
                    fontWeight: active ? 600 : 400, cursor: 'pointer',
                  }}
                >
                  {r.id}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Note */}
        <Field label="NOTE (OPTIONNEL)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Source, emplacement, usage prévu…"
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="submit" disabled={saving || !name.trim()} style={{ flex: 1 }}>
            {saving ? '…' : 'Enregistrer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── ChestModal (créer / éditer un coffre) ────────────────────────────────────

function ChestModal({ open, onClose, editing, ws, onSaved, toast }) {
  const isEdit = !!editing;
  const [name, setName]   = useState('');
  const [world, setWorld] = useState('overworld');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [z, setZ] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setWorld(editing?.world ?? 'overworld');
    setX(editing?.x ?? ''); setY(editing?.y ?? ''); setZ(editing?.z ?? '');
    setNote(editing?.note ?? '');
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        world: (world || '').trim() || 'overworld',
        x: x === '' ? null : Number(x),
        y: y === '' ? null : Number(y),
        z: z === '' ? null : Number(z),
        note: note.trim(),
      };
      const saved = isEdit
        ? await ws.minecraft.chests.update(editing.id, payload)
        : await ws.minecraft.chests.create(payload);
      toast.success(isEdit ? 'Coffre mis à jour' : 'Coffre créé');
      onSaved(saved);
    } catch (ex) {
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isPresetWorld = WORLDS.some((w) => w.id === world);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '✏️ Modifier le coffre' : '+ Nouveau coffre'} width={480}>
      <form onSubmit={submit}>
        <Field label="NOM DU COFFRE">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Réserve principale, Ferme à fer…" autoFocus required />
        </Field>

        <Field label="MONDE">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {WORLDS.map((w) => {
              const active = world === w.id;
              return (
                <button key={w.id} type="button" onClick={() => setWorld(w.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 16,
                    background: active ? `rgba(${ACC_RGB},0.2)` : 'rgba(20,12,40,0.6)',
                    border: `1px solid ${active ? ACC : 'rgba(80,50,130,0.3)'}`,
                    color: active ? ACC : 'rgba(180,170,200,0.7)',
                    fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                  }}
                >
                  {w.emoji} {w.label}
                </button>
              );
            })}
            <Input
              value={isPresetWorld ? '' : world}
              onChange={(e) => setWorld(e.target.value)}
              placeholder="autre monde…"
              style={{ flex: '1 1 120px', minWidth: 100 }}
            />
          </div>
        </Field>

        <Field label="COORDONNÉES (X / Y / Z)">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input type="number" value={x} onChange={(e) => setX(e.target.value)} placeholder="X" />
            <Input type="number" value={y} onChange={(e) => setY(e.target.value)} placeholder="Y" />
            <Input type="number" value={z} onChange={(e) => setZ(e.target.value)} placeholder="Z" />
          </div>
        </Field>

        <Field label="NOTE (OPTIONNEL)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Contenu, accès, repère…" />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="submit" disabled={saving || !name.trim()} style={{ flex: 1 }}>
            {saving ? '…' : 'Enregistrer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── ScreenshotModal (mise à jour d'un coffre depuis une capture d'écran) ──────
// Hybride : tente la lecture IA (POST /scan-screenshot) ; si indisponible (pas
// de clé) ou en échec, retombe sur la saisie manuelle avec le screenshot affiché
// en référence. Dans tous les cas l'utilisateur valide avant d'appliquer.

function ScreenshotModal({ chest, onClose, ws, catalog, iconIndex, onApplied, toast }) {
  const open = !!chest;
  const [preview, setPreview] = useState(null);  // object URL
  const [phase, setPhase] = useState('pick');    // pick | loading | edit
  const [rows, setRows] = useState([]);          // [{name, quantity}]
  const [mode, setMode] = useState('replace');   // replace | merge
  const [applying, setApplying] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const fileRef = useRef(null);

  const clearPreview = () => setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });

  useEffect(() => {
    if (!open) {
      clearPreview();
      setPhase('pick'); setRows([]); setMode('replace'); setApplying(false); setAiNote('');
    }
  }, [open]);
  // Revoke any pending object URL on unmount.
  useEffect(() => () => clearPreview(), []);

  if (!open) return null;

  const onPick = async (file) => {
    if (!file) return;
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(file); });
    setPhase('loading'); setAiNote('');
    try {
      const res = await ws.minecraft.scanScreenshot(file);
      if (res?.available && Array.isArray(res.items) && res.items.length) {
        setRows(res.items.map((it) => {
          const hit = matchCatalogName(catalog, it.name);
          return { name: hit ? hit.nomFr : it.name, quantity: Math.max(1, Number(it.quantity) || 1) };
        }));
        setAiNote('Lecture IA — vérifie et corrige avant d’appliquer.');
      } else if (res?.available) {
        setRows([{ name: '', quantity: 1 }]);
        setAiNote('Aucun item détecté automatiquement — saisis-les manuellement.');
      } else {
        setRows([{ name: '', quantity: 1 }]);
        setAiNote('Lecture IA indisponible (aucune clé configurée) — saisie manuelle, le screenshot reste affiché en référence.');
      }
    } catch (e) {
      setRows([{ name: '', quantity: 1 }]);
      setAiNote(`Lecture IA en échec (${e.message}) — saisie manuelle.`);
    } finally {
      setPhase('edit');
    }
  };

  const setRow = (i, patch) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { name: '', quantity: 1 }]);
  const delRow = (i) => setRows((prev) => prev.filter((_, j) => j !== i));

  const apply = async () => {
    const items = rows
      .map((r) => ({ name: (r.name || '').trim(), quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)) }))
      .filter((r) => r.name);
    setApplying(true);
    try {
      const list = await ws.minecraft.chests.apply(chest.id, { items, mode });
      onApplied(list);
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
      setApplying(false);
    }
  };

  const numStyle = {
    width: 72, boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
    border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
    color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
  };

  return (
    <Modal open={open} onClose={onClose} title={`📷 Mettre à jour « ${chest.name} »`} width={620}>
      {phase === 'pick' ? (
        <div>
          <p style={{ ...muted, fontSize: 13, marginBottom: 12 }}>
            Choisis une capture d’écran de l’interface du coffre. Si une clé IA est configurée, les
            items et quantités sont lus automatiquement (à valider) ; sinon, saisis-les à la main.
          </p>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => onPick(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()}>Choisir une image…</Button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {preview && (
              <img src={preview} alt="capture du coffre"
                style={{
                  width: 200, maxWidth: '100%', borderRadius: 8,
                  border: '1px solid rgba(80,50,130,0.3)', alignSelf: 'flex-start',
                  imageRendering: 'pixelated',
                }} />
            )}
            <div style={{ flex: '1 1 280px', minWidth: 240 }}>
              {aiNote && <p style={{ ...muted, fontSize: 12, marginTop: 0, marginBottom: 10 }}>{aiNote}</p>}
              {phase === 'loading' ? (
                <p style={{ ...muted, fontSize: 13 }}>Lecture en cours…</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {rows.map((row, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ItemIcon name={row.name} iconIndex={iconIndex} size={20} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <BlockPicker value={row.name} onChange={(v) => setRow(i, { name: v })} catalog={catalog} />
                        </div>
                        <input type="number" min="0" value={row.quantity}
                          onChange={(e) => setRow(i, { quantity: e.target.value })} style={numStyle} />
                        <button type="button" onClick={() => delRow(i)} title="Retirer"
                          style={{
                            background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)',
                            color: '#f87171', borderRadius: 7, padding: '6px 9px', cursor: 'pointer', fontSize: 13,
                          }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addRow}
                    style={{
                      marginTop: 8, background: 'none', border: '1px dashed rgba(80,50,130,0.4)',
                      color: 'rgba(180,170,200,0.8)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif", fontSize: 13,
                    }}>
                    + Ajouter une ligne
                  </button>
                </>
              )}
            </div>
          </div>

          {phase !== 'loading' && (
            <>
              <Field label="MODE">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['replace', 'Remplacer le contenu'], ['merge', 'Ajouter au contenu']].map(([m, label]) => {
                    const active = mode === m;
                    return (
                      <button key={m} type="button" onClick={() => setMode(m)}
                        style={{
                          padding: '7px 14px', borderRadius: 16,
                          background: active ? `rgba(${ACC_RGB},0.2)` : 'rgba(20,12,40,0.6)',
                          border: `1px solid ${active ? ACC : 'rgba(80,50,130,0.3)'}`,
                          color: active ? ACC : 'rgba(180,170,200,0.7)',
                          fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button onClick={apply} disabled={applying} style={{ flex: 1 }}>
                  {applying ? '…' : (mode === 'replace' ? 'Remplacer le coffre' : 'Ajouter au coffre')}
                </Button>
                <Button variant="ghost" onClick={onClose} disabled={applying}>Annuler</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── BlockPicker — combobox over the Minecraft 1.18.2 block catalogue ──────────

function BlockPicker({ value, onChange, catalog, autoFocus }) {
  const [open, setOpen]           = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);

  // Items custom Minefield (avec icône) d'abord, puis blocs vanilla (emoji),
  // dédupliqués par nom.
  const suggestions = useMemo(() => {
    const mf = searchCatalog(catalog, value, 40).map((e) => ({
      name: e.nomFr, category: e.categorie, icon: e.icon,
    }));
    const seen = new Set(mf.map((s) => normName(s.name)));
    const vanilla = searchBlocks(value, 40)
      .filter((b) => !seen.has(normName(b.name)))
      .map((b) => ({ name: b.name, category: b.category, icon: null }));
    return [...mf, ...vanilla].slice(0, 80);
  }, [catalog, value]);
  useEffect(() => { setHighlight(0); }, [value]);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const pick = (s) => { onChange(s.name); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && suggestions[highlight]) { e.preventDefault(); pick(suggestions[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Diamant, planches en chêne, redstone…"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        required
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            marginTop: 4, zIndex: 1000,
            background: '#0b0620',
            border: '1px solid rgba(80,50,130,0.35)',
            borderRadius: 10,
            boxShadow: '0 18px 36px rgba(0,0,0,0.55)',
            maxHeight: 280, overflowY: 'auto',
            padding: 4,
          }}
        >
          {suggestions.map((s, i) => {
            const active = i === highlight;
            return (
              <button
                type="button"
                key={`${s.category}-${s.name}-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12,
                  padding: '7px 10px', borderRadius: 6,
                  background: active ? `rgba(${ACC_RGB},0.14)` : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: active ? ACC : '#ede8f8',
                  fontFamily: "'Inter',sans-serif", fontSize: 13,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {s.icon ? (
                    <img
                      src={s.icon} alt="" width={18} height={18} loading="lazy" draggable={false}
                      style={{ imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{ fontSize: 15, width: 18, textAlign: 'center', flexShrink: 0 }}>
                      {getItemEmoji(s.name, s.category)}
                    </span>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                </span>
                <span style={{
                  ...muted, fontSize: 11, flexShrink: 0,
                  letterSpacing: '0.3px', textTransform: 'uppercase',
                }}>
                  {s.category}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
