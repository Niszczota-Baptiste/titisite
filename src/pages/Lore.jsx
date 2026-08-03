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
import { DossierView, ExportTab } from '../components/lore/ExportTab';
import { GraphTab } from '../components/lore/GraphTab';
import { HypothesesTab, HypothesisEditor } from '../components/lore/HypothesesTab';
import { HypothesisDetail } from '../components/lore/HypothesisDetail';
import { MapTab } from '../components/lore/MapTab';
import { TimelineTab } from '../components/lore/TimelineTab';
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

const TABS = [
  ['entrees', '📖 Entrées'],
  ['carte', '🗺 Carte'],
  ['hypotheses', '🧪 Hypothèses'],
  ['graphe', '🕸 Graphe'],
  ['timeline', '🕰 Timeline'],
  ['export', '📤 Export'],
];

function LoreApp({ user }) {
  const [tab, setTab] = useState('entrees');
  const [filters, setFilters] = useState({});
  const [entries, setEntries] = useState([]);       // liste filtrée affichée
  const [entriesAll, setEntriesAll] = useState([]); // liste complète (liens [[…]], relations)
  const [tags, setTags] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  // { entry: null | entrée complète, coords: null | {x,z,dimension} } — coords
  // vient du mode « ➕ Point » de la carte et préremplit l'éditeur.
  const [editing, setEditing] = useState(null);
  // Hypothèses : fiche + éditeur. Une seule fiche ouverte à la fois (entrée OU
  // hypothèse) — les helpers openEntry/openHyp s'excluent mutuellement.
  const [hypId, setHypId] = useState(null);
  const [hypDetail, setHypDetail] = useState(null);
  const [hypEditing, setHypEditing] = useState(null); // { hyp: null | hypothèse complète }
  // Dossier imprimable : remplace toute la page (fond papier, @media print).
  const [dossier, setDossier] = useState(false);
  // Compteur incrémenté à chaque mutation : les onglets qui gèrent leurs
  // propres données (carte) rechargent quand il bouge.
  const [bump, setBump] = useState(0);
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

  useEffect(() => {
    if (hypId == null) { setHypDetail(null); return; }
    let alive = true;
    api.lore.hypotheses.get(hypId).then((d) => { if (alive) setHypDetail(d); }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [hypId]);

  const openEntry = (id) => { setHypId(null); setDetailId(id); };
  const openHyp = (id) => { setDetailId(null); setHypId(id); };

  const refreshAll = useCallback(async () => {
    setBump((b) => b + 1);
    await Promise.all([loadRef(), loadFiltered()]);
  }, [loadRef, loadFiltered]);

  const refreshDetail = useCallback(() => {
    if (detailId != null) {
      api.lore.entries.get(detailId).then(setDetail).catch((e) => setErr(e.message));
    }
    refreshAll().catch(() => {});
  }, [detailId, refreshAll]);

  const refreshHyp = useCallback(() => {
    if (hypId != null) {
      api.lore.hypotheses.get(hypId).then(setHypDetail).catch((e) => setErr(e.message));
    }
    refreshAll().catch(() => {});
  }, [hypId, refreshAll]);

  const onSaved = async (id) => {
    setEditing(null);
    await refreshAll().catch(() => {});
    setDetailId(id);
  };

  const onDeleted = async () => {
    setDetailId(null);
    await refreshAll().catch(() => {});
  };

  if (dossier) {
    return <DossierView onBack={() => setDossier(false)} />;
  }

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
            onOpen={setDetailId} onCreate={() => setEditing({ entry: null, coords: null })}
          />
        )}
        {tab === 'carte' && (
          <MapTab
            onOpenEntry={openEntry} refreshKey={bump}
            onCreateAt={(coords) => setEditing({ entry: null, coords })}
          />
        )}
        {tab === 'hypotheses' && (
          <HypothesesTab
            onOpen={openHyp} refreshKey={bump}
            onCreate={() => setHypEditing({ hyp: null })}
          />
        )}
        {tab === 'graphe' && (
          <GraphTab onOpenEntry={openEntry} onOpenHypothesis={openHyp} refreshKey={bump} />
        )}
        {tab === 'timeline' && (
          <TimelineTab
            entries={entriesAll} onOpenEntry={openEntry} onOpenHypothesis={openHyp}
            refreshKey={bump}
          />
        )}
        {tab === 'export' && <ExportTab onOpenDossier={() => setDossier(true)} />}
      </div>

      {/* fiche détail */}
      <Modal open={detailId != null && editing === null} onClose={() => setDetailId(null)} title="" width={760}>
        {detail ? (
          <EntryDetail
            entry={detail} entries={entriesAll} user={user}
            onEdit={() => setEditing({ entry: detail, coords: null })}
            onDeleted={onDeleted}
            onOpenEntry={openEntry}
            onOpenHypothesis={openHyp}
            onChanged={refreshDetail}
          />
        ) : <p style={{ color: MUTED }}>Chargement…</p>}
      </Modal>

      {/* fiche hypothèse */}
      <Modal open={hypId != null && hypEditing === null} onClose={() => setHypId(null)} title="" width={760}>
        {hypDetail ? (
          <HypothesisDetail
            hypothesis={hypDetail} entries={entriesAll} user={user}
            onEdit={() => setHypEditing({ hyp: hypDetail })}
            onDeleted={() => { setHypId(null); refreshAll().catch(() => {}); }}
            onOpenEntry={openEntry}
            onChanged={refreshHyp}
          />
        ) : <p style={{ color: MUTED }}>Chargement…</p>}
      </Modal>

      {/* éditeur d'hypothèse */}
      <Modal
        open={hypEditing !== null}
        onClose={() => setHypEditing(null)}
        title={hypEditing?.hyp ? 'Modifier l\'hypothèse' : 'Nouvelle hypothèse'}
        width={680}
      >
        {hypEditing !== null && (
          <HypothesisEditor
            hypothesis={hypEditing.hyp}
            entries={entriesAll}
            onSaved={async (id) => {
              setHypEditing(null);
              await refreshAll().catch(() => {});
              openHyp(id);
              // openHyp ne re-déclenche pas l'effet si l'id n'a pas changé
              // (édition de la fiche déjà ouverte) — refetch explicite.
              api.lore.hypotheses.get(id).then(setHypDetail).catch(() => {});
            }}
            onCancel={() => setHypEditing(null)}
          />
        )}
      </Modal>

      {/* éditeur */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.entry ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
        width={720}
      >
        {editing !== null && (
          <EntryEditor
            entry={editing.entry}
            initial={editing.coords}
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
