import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import {
  buildIconIndex, customCatalogEntries, loadMinefieldCatalog, normName,
} from '../../data/minefieldCatalog';
import { useWorkspace } from '../../hooks/useWorkspace';
import { getItemEmoji } from './Minecraft';
import { ACC, ACC_RGB, ErrorBanner, Section, card, muted, relativeDate } from './shared';

// « 📊 Résumé » — page d'accueil des projets 100 % Minecraft : l'état du projet
// en un coup d'œil (stats coffres/items/wanted/builds), les wanted encore à
// récupérer avec leur progression, et le fil des derniers ajouts (items,
// coffres, wanted, builds 3D confondus). Tout est calculé côté client à partir
// des listes existantes — aucun endpoint dédié.
export function MinecraftResumeTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);

  const [items, setItems] = useState([]);
  const [chests, setChests] = useState([]);
  const [wanted, setWanted] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([
      ws.minecraft.list(),
      ws.minecraft.chests.list(),
      ws.minecraft.wanted.list(),
      ws.blueprints.list().catch(() => []),
    ])
      .then(([its, chs, wtd, bps]) => {
        if (!alive) return;
        setItems(its); setChests(chs); setWanted(wtd); setBuilds(bps);
      })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line -- recharger uniquement quand le projet change
  }, [workspace.slug]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadMinefieldCatalog(), api.quests.customItems().catch(() => [])])
      .then(([c, custom]) => { if (alive) setCatalog([...customCatalogEntries(custom, c), ...c]); });
    return () => { alive = false; };
  }, []);

  const iconIndex = useMemo(() => buildIconIndex(catalog), [catalog]);

  const totalUnits = items.reduce((s, r) => s + (r.quantity || 0), 0);
  const haveByName = useMemo(() => {
    const m = new Map();
    for (const r of items) {
      const k = normName(r.name);
      m.set(k, (m.get(k) || 0) + (r.quantity || 0));
    }
    return m;
  }, [items]);

  const wantedOpen = useMemo(() => (
    wanted
      .filter((w) => !w.done)
      .sort((a, b) => (a.priority - b.priority) || (a.position - b.position))
  ), [wanted]);

  // Fil des derniers ajouts, toutes sources confondues (12 max).
  const recent = useMemo(() => {
    const feed = [
      ...items.map((r) => ({
        kind: 'item', at: r.createdAt, by: r.createdByName,
        name: r.name, qty: r.quantity, category: r.category,
        sub: r.chestId ? (chests.find((c) => c.id === r.chestId)?.name || null) : 'Non rangé',
      })),
      ...chests.map((c) => ({
        kind: 'coffre', at: c.createdAt, by: c.createdByName,
        name: c.name, sub: c.world || null,
      })),
      ...wanted.map((w) => ({
        kind: 'wanted', at: w.createdAt, by: w.createdByName,
        name: w.name, qty: w.quantity, done: w.done,
      })),
      ...builds.map((b) => ({
        kind: 'build', at: b.createdAt,
        name: b.name, sub: b.blockCount ? `${b.blockCount} blocs` : null,
      })),
    ];
    return feed
      .filter((e) => e.at)
      .sort((a, b) => b.at - a.at)
      .slice(0, 12);
  }, [items, chests, wanted, builds]);

  if (loading) {
    return (
      <Section title="📊 Résumé du projet">
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      </Section>
    );
  }

  return (
    <Section title="📊 Résumé du projet">
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {/* ── Chiffres clés ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 20 }}>
        <Stat label="Coffres" value={chests.length} emoji="🧰" to="../minecraft" />
        <Stat label="Items distincts" value={items.length} emoji="📦" to="../minecraft" />
        <Stat label="Unités" value={totalUnits} emoji="🪙" to="../minecraft" sub={`${Math.floor(totalUnits / 64)} stack${Math.floor(totalUnits / 64) > 1 ? 's' : ''} ×64`} />
        <Stat label="Wanted restants" value={wantedOpen.length} emoji="🎯" to="../wanted" accent="#fb923c" />
        <Stat label="Builds 3D" value={builds.length} emoji="🏗️" to="../builds3d" accent="#c084fc" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
        {/* ── Wanted en cours (progression possédé / voulu) ── */}
        <div style={{ ...card, padding: 16 }}>
          <PanelTitle emoji="🎯" title="Wanted en cours" linkTo="../wanted" linkLabel="Tout voir" />
          {wantedOpen.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, margin: 0 }}>Rien à récupérer — la wishlist est à jour. 🎉</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {wantedOpen.slice(0, 5).map((w) => {
                const have = haveByName.get(normName(w.name)) || 0;
                const ratio = w.quantity > 0 ? Math.min(1, have / w.quantity) : 0;
                const ready = have >= w.quantity;
                return (
                  <div key={w.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ede8f8' }}>
                      <ItemMiniIcon name={w.name} iconIndex={iconIndex} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                      <span style={{
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700,
                        color: ready ? '#4ade80' : (have > 0 ? '#fb923c' : 'rgba(180,170,200,0.55)'),
                      }}>{have} / {w.quantity}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 4, background: 'rgba(80,50,130,0.25)', marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 4, background: ready ? '#4ade80' : '#fb923c' }} />
                    </div>
                  </div>
                );
              })}
              {wantedOpen.length > 5 && (
                <p style={{ ...muted, fontSize: 11.5, margin: 0 }}>… et {wantedOpen.length - 5} autre{wantedOpen.length - 5 > 1 ? 's' : ''}.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Derniers ajouts ── */}
        <div style={{ ...card, padding: 16 }}>
          <PanelTitle emoji="🕐" title="Derniers ajouts" />
          {recent.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, margin: 0 }}>
              Rien pour l'instant — ajoute un coffre, un item ou un build pour commencer.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {recent.map((e, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 8, background: 'rgba(14,9,28,0.5)',
                  fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(224,216,240,0.9)',
                }}>
                  {e.kind === 'item' ? (
                    <ItemMiniIcon name={e.name} iconIndex={iconIndex} category={e.category} />
                  ) : (
                    <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>
                      {e.kind === 'coffre' ? '🧰' : e.kind === 'wanted' ? '🎯' : '🏗️'}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}
                    {e.qty != null && <span style={{ color: ACC, fontWeight: 600 }}> ×{e.qty}</span>}
                    {e.sub && <span style={{ ...muted, fontSize: 11.5 }}> · {e.sub}</span>}
                  </span>
                  <span style={{ ...muted, fontSize: 11, flexShrink: 0 }} title={e.by ? `par ${e.by}` : undefined}>
                    {relativeDate(e.at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function PanelTitle({ emoji, title, linkTo, linkLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
      <span style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 700, color: '#ede8f8',
      }}>{emoji} {title}</span>
      {linkTo && (
        <Link to={linkTo} style={{ marginLeft: 'auto', color: ACC, textDecoration: 'none', fontFamily: "'Inter',sans-serif", fontSize: 12 }}>
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function Stat({ label, value, emoji, sub, to, accent }) {
  return (
    <Link to={to} style={{
      ...card, padding: '12px 14px', textDecoration: 'none', display: 'block',
      transition: 'border-color 0.18s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent || ACC; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.24)'; }}
    >
      <div style={{ ...muted, fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>
        {emoji} {label}
      </div>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 800,
        color: accent || `rgba(${ACC_RGB},1)`, marginTop: 2,
      }}>{value}</div>
      {sub && <div style={{ ...muted, fontSize: 11 }}>{sub}</div>}
    </Link>
  );
}

// Icône plate d'un item par nom normalisé (codex + items custom), repli emoji.
function ItemMiniIcon({ name, iconIndex, category }) {
  const url = iconIndex?.get(normName(name));
  return url ? (
    <img src={url} alt="" width={20} height={20} loading="lazy" draggable={false}
      style={{ imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }} />
  ) : (
    <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>
      {getItemEmoji(name, category)}
    </span>
  );
}
