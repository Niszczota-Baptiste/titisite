import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { Login } from '../components/admin/Login';
import { Modal } from '../components/project/shared';
import { EntryDetail } from '../components/lore/EntryDetail';
import { EntryEditor } from '../components/lore/EntryEditor';
import { EntryList } from '../components/lore/EntryList';
import { MapTab } from '../components/lore/MapTab';
import { ACC, ACC_RGB, GOLD, INK, MUTED } from '../components/lore/theme';

// Salle d'enquête « Lore Nostra » — module global gaté par le tag lore
// (users.can_view_lore, admins outre) : même patron de page que /quetes.
// Un compte sans le tag ne voit rien, et l'entrée de menu (lien dans l'onglet
// Minecraft des projets) ne lui est pas montrée non plus.

export default function Lore() {
  const { user, loading } = useAuth();
  usePageMeta('Lore Nostra');

  if (loading) {
    return <div style={fullScreen}><p style={{ color: MUTED }}>Chargement…</p></div>;
  }
  if (!user) {
    return <Login title="Lore Nostra" subtitle="Connecte-toi pour entrer dans la salle d'enquête." />;
  }
  if (!user.canViewLore) {
    return (
      <div style={fullScreen}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: INK }}>Accès refusé</h1>
        <p style={{ color: MUTED }}>Ton compte n'a pas accès à la salle d'enquête.</p>
        <Link to="/" style={{ color: ACC, textDecoration: 'none', marginTop: 12 }}>← Retour</Link>
      </div>
    );
  }
  return <LoreApp user={user} />;
}

// Les étapes suivantes ajouteront 🧪 Hypothèses, 🕸 Graphe, 🕰 Timeline et
// 📤 Export — un onglet chacune.
const TABS = [
  ['entrees', '📖 Entrées'],
  ['carte', '🗺 Carte'],
];

function LoreApp({ user }) {
  const [tab, setTab] = useState('entrees');
  const [filters, setFilters] = useState({});
  const [entries, setEntries] = useState([]);       // liste filtrée affichée
  const [entriesAll, setEntriesAll] = useState([]); // liste complète (liens [[…]], relations)
  const [tags, setTags] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | entrée complète
  const [err, setErr] = useState(null);

  // Projet d'origine (lien « 🔍 Lore » de l'onglet Minecraft → ?projet=<slug>),
  // mémorisé en session comme sur /quetes.
  const fromProject = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('projet');
    const slug = raw && /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null;
    if (slug) sessionStorage.setItem('lore_from_project', slug);
    return slug || sessionStorage.getItem('lore_from_project');
  }, []);

  const loadRef = useCallback(async () => {
    const [all, tg] = await Promise.all([api.lore.entries.list(), api.lore.tags.list()]);
    setEntriesAll(all);
    setTags(tg);
  }, []);

  const loadFiltered = useCallback(async () => {
    setEntries(await api.lore.entries.list(filters));
  }, [filters]);

  useEffect(() => { loadRef().catch((e) => setErr(e.message)); }, [loadRef]);
  useEffect(() => { loadFiltered().catch((e) => setErr(e.message)); }, [loadFiltered]);

  useEffect(() => {
    if (detailId == null) { setDetail(null); return; }
    let alive = true;
    api.lore.entries.get(detailId).then((d) => { if (alive) setDetail(d); }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [detailId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRef(), loadFiltered()]);
  }, [loadRef, loadFiltered]);

  const refreshDetail = useCallback(() => {
    if (detailId != null) {
      api.lore.entries.get(detailId).then(setDetail).catch((e) => setErr(e.message));
    }
    refreshAll().catch(() => {});
  }, [detailId, refreshAll]);

  const onSaved = async (id) => {
    setEditing(null);
    await refreshAll().catch(() => {});
    setDetailId(id);
  };

  const onDeleted = async () => {
    setDetailId(null);
    await refreshAll().catch(() => {});
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% -10%, #0e2418, #070512 60%)', paddingBottom: 60 }}>
      <Banner backSlug={fromProject} />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
          {TABS.map(([k, l]) => {
            const on = tab === k;
            return (
              <button
                key={k} type="button" onClick={() => setTab(k)}
                style={{
                  padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14, fontWeight: 700,
                  background: on ? `linear-gradient(180deg, ${ACC}, #55c288)` : 'rgba(9,20,15,0.6)',
                  color: on ? '#06130b' : INK,
                  border: on ? 'none' : `1px solid rgba(${ACC_RGB},0.2)`,
                }}
              >{l}</button>
            );
          })}
        </div>

        {err && (
          <div style={{ background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.3)', borderRadius: 8, padding: '9px 14px', marginBottom: 16, color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
            {err} <button type="button" onClick={() => setErr(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ff8a9b', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {tab === 'entrees' && (
          <EntryList
            entries={entries} tags={tags} filters={filters} setFilters={setFilters}
            onOpen={setDetailId} onCreate={() => setEditing('new')}
          />
        )}
        {tab === 'carte' && <MapTab onOpenEntry={setDetailId} />}
      </div>

      {/* fiche détail */}
      <Modal open={detailId != null && editing === null} onClose={() => setDetailId(null)} title="" width={760}>
        {detail ? (
          <EntryDetail
            entry={detail} entries={entriesAll} user={user}
            onEdit={() => setEditing(detail)}
            onDeleted={onDeleted}
            onOpenEntry={(id) => setDetailId(id)}
            onChanged={refreshDetail}
          />
        ) : <p style={{ color: MUTED }}>Chargement…</p>}
      </Modal>

      {/* éditeur */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle entrée' : 'Modifier l\'entrée'}
        width={720}
      >
        {editing !== null && (
          <EntryEditor
            entry={editing === 'new' ? null : editing}
            entries={entriesAll}
            onSaved={onSaved}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function Banner({ backSlug }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', marginBottom: 28,
      background: 'linear-gradient(135deg, rgba(16,50,34,0.6), rgba(18,30,45,0.75))',
      borderBottom: `2px solid rgba(${ACC_RGB},0.3)`,
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        background: `radial-gradient(circle at 15% 20%, rgba(123,227,168,0.2), transparent 40%), radial-gradient(circle at 85% 30%, rgba(232,200,106,0.15), transparent 45%)`,
      }} />
      <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '34px 20px 26px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', color: GOLD }}>
            Nostra · Minefield
          </div>
          <h1 style={{ margin: '4px 0 0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 800, color: INK, letterSpacing: '-0.5px', textShadow: `0 2px 20px rgba(${ACC_RGB},0.3)` }}>
            🔍 Salle d'enquête
          </h1>
          <p style={{ margin: '6px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'rgba(206,224,214,0.75)' }}>
            Observations, hypothèses, preuves — les pistes mortes restent au dossier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {backSlug && (
            <Link
              to={`/project/${backSlug}/minecraft`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
                textDecoration: 'none', fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
                background: 'rgba(9,20,14,0.72)', color: GOLD, border: `1px solid ${GOLD}`,
              }}
            >⛏️ ← Retour au projet</Link>
          )}
          <Link to="/" style={{ color: MUTED, textDecoration: 'none', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>← Site</Link>
        </div>
      </div>
    </div>
  );
}

const fullScreen = {
  minHeight: '100vh', background: '#070512', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: INK,
};
