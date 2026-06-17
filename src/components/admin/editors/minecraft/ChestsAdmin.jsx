import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../../api/client';
import { buildIconIndex, normName } from '../../../../data/minefieldCatalog';
import { useCodex } from '../../../../hooks/useCodex';
import { Empty, ErrorBanner } from '../../../project/shared';
import { ACC_RGB, inputStyle } from '../../ui';

const WORLD_EMOJI = { overworld: '🌳', nether: '🔥', end: '🌌' };
const worldEmoji = (w) => WORLD_EMOJI[w] || '🗺️';

// Vue cross-projets admin : tous les coffres + ressources de toutes les
// workspaces Minecraft, avec recherche d'item globale, filtre par projet et
// édition directe des quantités.
export function ChestsAdmin() {
  const { catalog } = useCodex();
  const iconIndex = useMemo(() => buildIconIndex(catalog), [catalog]);
  const [data, setData] = useState(null);
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');

  const load = () => api.minecraftAdmin.overview().then(setData).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); }, []);

  const resources = data?.resources || [];
  const filtered = useMemo(() => {
    const q = normName(search);
    return resources.filter((r) => {
      if (project && r.workspaceSlug !== project) return false;
      if (q && !normName(r.name).includes(q)) return false;
      return true;
    });
  }, [resources, project, search]);

  const setQuantity = async (row, quantity) => {
    try {
      await api.minecraftAdmin.adjustItem(row.id, { quantity });
      setData((d) => ({
        ...d,
        resources: d.resources.map((r) => (r.id === row.id ? { ...r, quantity } : r)),
      }));
    } catch { setErr('Mise à jour impossible.'); }
  };

  if (data == null) return <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>Chargement…</p>;

  const totalUnits = filtered.reduce((s, r) => s + r.quantity, 0);

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr('')} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un item dans tous les projets…"
          style={{ ...inputStyle, flex: '1 1 240px' }}
        />
        <select value={project} onChange={(e) => setProject(e.target.value)} style={{ ...inputStyle, flex: '0 1 220px' }}>
          <option value="">Tous les projets</option>
          {(data.projects || []).map((p) => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)', marginTop: 0, marginBottom: 14 }}>
        {data.chests.length} coffre{data.chests.length > 1 ? 's' : ''} ·
        {' '}{filtered.length} ligne{filtered.length > 1 ? 's' : ''} ·
        {' '}{totalUnits} unité{totalUnits > 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <Empty>Aucun item ne correspond.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((r) => {
            const icon = iconIndex.get(normName(r.name));
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                background: 'rgba(20,10,42,0.5)', border: '1px solid rgba(80,50,130,0.24)',
                borderRadius: 10, padding: '8px 12px',
              }}>
                <div style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {icon
                    ? <img src={icon} alt="" width={24} height={24} style={{ imageRendering: 'pixelated' }} />
                    : <span style={{ fontSize: 18 }}>📦</span>}
                </div>
                <span style={{ color: '#ede8f8', fontSize: 14, minWidth: 140, flex: '1 1 140px' }}>{r.name}</span>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10,
                  background: `rgba(${ACC_RGB},0.14)`, color: 'rgba(210,195,235,0.9)', whiteSpace: 'nowrap',
                }}>
                  {r.workspaceName}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.7)', whiteSpace: 'nowrap' }}>
                  {r.chestName ? `${worldEmoji(r.chestWorld)} ${r.chestName}` : '📦 Non rangé'}
                </span>
                <input
                  type="number" min={0} defaultValue={r.quantity} key={`${r.id}:${r.quantity}`}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    if (v !== r.quantity) setQuantity(r, v);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ ...inputStyle, width: 88, marginLeft: 'auto', textAlign: 'right' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
