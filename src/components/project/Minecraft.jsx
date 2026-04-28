import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { searchBlocks } from '../../data/minecraftBlocks';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWorkspace } from '../../hooks/useWorkspace';
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

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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
    try { setItems(await ws.minecraft.list()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

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

  // ── Render (see bottom of file) ───────────────────────────────────────────
  const subtitle = `Inventaire personnel · ${items.length} item${items.length > 1 ? 's' : ''} · ${totalUnits} unité${totalUnits > 1 ? 's' : ''}`;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? 'Trier';

  return (
    <Section
      title="⛏️ Ressources Minecraft"
      actions={
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          + Ajouter un item
        </Button>
      }
    >
      {items.length > 0 && (
        <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 16 }}>{subtitle}</p>
      )}
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucune ressource. Ajoute-en une pour commencer (ex. Diamants, Obsidienne, Bois…).</Empty>
      ) : (
        <>
          {/* ── Stats ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label="ITEMS"      value={items.length} />
            <StatCard label="TOTAL"      value={totalUnits}    unit="unités" />
            <StatCard label="STACKS×64"  value={totalStacks64} accent="#4ade80" />
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
              <button
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
                    <button
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

          {/* ── Favoris toggle + view mode ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button
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
            <div style={{
              display: 'flex', borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(80,50,130,0.28)',
            }}>
              {['grid', 'list'].map((mode, i) => (
                <button
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

          {/* ── Item list ── */}
          {displayed.length === 0 ? (
            <Empty>Aucun item ne correspond aux filtres.</Empty>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayed.map((r) => (
                <ItemCard
                  key={r.id} r={r} busy={busyId === r.id}
                  onAdjust={(d) => adjust(r.id, d)}
                  onEdit={() => { setEditing(r); setModalOpen(true); }}
                  onRemove={() => remove(r)}
                  onToggleFav={() => toggleFav(r)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayed.map((r) => (
                <ItemRow
                  key={r.id} r={r} busy={busyId === r.id}
                  onAdjust={(d) => adjust(r.id, d)}
                  onEdit={() => { setEditing(r); setModalOpen(true); }}
                  onRemove={() => remove(r)}
                  onToggleFav={() => toggleFav(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ResourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        ws={ws}
        onSaved={handleSaved}
        onError={(e) => setErr(e.message)}
        toast={toast}
      />
    </Section>
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
    <button
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

function ItemCard({ r, busy, onAdjust, onEdit, onRemove, onToggleFav }) {
  const emoji  = getItemEmoji(r.name, r.category);
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
          fontSize: 24,
        }}>
          {emoji}
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
        <button
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
        <button
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
        <button
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

function ItemRow({ r, busy, onAdjust, onEdit, onRemove, onToggleFav }) {
  const emoji = getItemEmoji(r.name, r.category);
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
          fontSize: 18, width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(20,10,42,0.85)', borderRadius: 6,
        }}>
          {emoji}
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

        <button
          onClick={onToggleFav}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, padding: '3px 4px',
            color: r.favorite ? '#fb923c' : 'rgba(180,170,200,0.28)',
          }}
        >
          {r.favorite ? '★' : '☆'}
        </button>
        <button
          onClick={onEdit}
          style={{
            background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
            color: '#ede8f8', borderRadius: 6, padding: '5px 8px',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          ✏️
        </button>
        <button
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

// ── ResourceModal ─────────────────────────────────────────────────────────────

function ResourceModal({ open, onClose, editing, ws, onSaved, onError, toast }) {
  const isEdit = !!editing;
  const [name,     setName]     = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes,    setNotes]    = useState('');
  const [category, setCategory] = useState('');
  const [rarity,   setRarity]   = useState('Commun');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name     ?? '');
    setQuantity(editing?.quantity ?? 0);
    setNotes(editing?.notes    ?? '');
    setCategory(editing?.category ?? '');
    setRarity(editing?.rarity   ?? 'Commun');
  }, [open, editing]);

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
          <BlockPicker value={name} onChange={setName} autoFocus />
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

// ── BlockPicker — combobox over the Minecraft 1.18.2 block catalogue ──────────

function BlockPicker({ value, onChange, autoFocus }) {
  const [open, setOpen]           = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);

  const suggestions = useMemo(() => searchBlocks(value, 60), [value]);
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
                <span>{s.name}</span>
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
