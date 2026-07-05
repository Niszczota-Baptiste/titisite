import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCodex } from '../hooks/useCodex';
import { usePageMeta } from '../hooks/usePageMeta';
import { Login } from '../components/admin/Login';
import { Modal } from '../components/project/shared';
import { ChainGraph } from '../components/quests/ChainGraph';
import { CockpitPanel } from '../components/quests/CockpitPanel';
import { GainsView } from '../components/quests/GainsView';
import { QuestDetail } from '../components/quests/QuestDetail';
import { QuestEditor } from '../components/quests/QuestEditor';
import { QuestList } from '../components/quests/QuestList';
import { ReputationView } from '../components/quests/ReputationView';
import { ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED } from '../components/quests/theme';

export default function Quetes() {
  const { user, loading } = useAuth();
  usePageMeta('Quêtes');

  if (loading) {
    return <div style={fullScreen}><p style={{ color: MUTED }}>Chargement…</p></div>;
  }
  if (!user) {
    return <Login title="Quêtes" subtitle="Connecte-toi pour accéder au journal de quêtes." />;
  }
  if (!user.canViewQuests) {
    return (
      <div style={fullScreen}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: INK }}>Accès refusé</h1>
        <p style={{ color: MUTED }}>Ton compte n'a pas accès au journal de quêtes.</p>
        <Link to="/" style={{ color: ACC, textDecoration: 'none', marginTop: 12 }}>← Retour</Link>
      </div>
    );
  }
  return <QuestsApp user={user} />;
}

const TABS = [
  ['quetes', 'Quêtes'],
  ['chaines', 'Chaînes'],
  ['reputation', 'Réputation'],
  ['gains', 'Gains'],
];

function QuestsApp({ user }) {
  const { byId, catalog } = useCodex();
  const [tab, setTab] = useState('quetes');
  const [factions, setFactions] = useState(new Map());
  const [chains, setChains] = useState([]);
  const [groups, setGroups] = useState([]);
  const [quests, setQuests] = useState([]);
  const [doneMap, setDoneMap] = useState({});
  const [filters, setFilters] = useState({ status: 'all' });
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cockpitOpen, setCockpitOpen] = useState(false);
  const [err, setErr] = useState(null);

  const canEdit = !!user.canEditQuests;

  const loadRef = useCallback(async () => {
    const [fac, ch, gr] = await Promise.all([
      api.quests.factions(), api.quests.chains(), api.quests.groups(),
    ]);
    setFactions(new Map(fac.map((f) => [f.id, f])));
    setChains(ch);
    setGroups(gr);
  }, []);

  const loadQuests = useCallback(async () => {
    const params = {};
    if (filters.faction) params.faction = filters.faction;
    if (filters.occurrence) params.occurrence = filters.occurrence;
    if (filters.chain) params.chain = filters.chain;
    if (filters.group) params.group = filters.group;
    const [qs, mine] = await Promise.all([api.quests.list(params), api.quests.mine()]);
    setQuests(qs);
    setDoneMap(mine.done || {});
  }, [filters.faction, filters.occurrence, filters.chain, filters.group]);

  useEffect(() => { loadRef().catch((e) => setErr(e.message)); }, [loadRef]);
  useEffect(() => { loadQuests().catch((e) => setErr(e.message)); }, [loadQuests]);

  // Full detail fetch when a quest is opened.
  useEffect(() => {
    if (detailId == null) { setDetail(null); return; }
    let alive = true;
    api.quests.get(detailId).then((d) => { if (alive) setDetail(d); }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [detailId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadRef(), loadQuests()]);
  }, [loadRef, loadQuests]);

  const setDone = (id, done) => {
    setQuests((qs) => qs.map((q) => (q.id === id ? { ...q, done } : q)));
    setDoneMap((m) => { const n = { ...m }; if (done) n[id] = true; else delete n[id]; return n; });
    setDetail((d) => (d && d.id === id ? { ...d, done } : d));
  };

  const complete = async (q) => {
    setBusy(true);
    try { await api.quests.complete(q.id); setDone(q.id, true); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const uncomplete = async (q) => {
    setBusy(true);
    try { await api.quests.uncomplete(q.id); setDone(q.id, false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% -10%, #17102e, #070512 60%)', paddingBottom: 60 }}>
      <Banner user={user} canEdit={canEdit} onCockpit={() => setCockpitOpen(true)} />

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px' }}>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
          {TABS.concat(canEdit ? [['editeur', '✎ Éditeur']] : []).map(([k, l]) => {
            const on = tab === k;
            return (
              <button
                key={k} type="button" onClick={() => setTab(k)}
                style={{
                  padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14, fontWeight: 700,
                  background: on ? `linear-gradient(180deg, ${GOLD}, #d8a94a)` : 'rgba(20,14,38,0.6)',
                  color: on ? '#1a1206' : INK,
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

        {tab === 'quetes' && (
          <QuestList quests={quests} factions={factions} chains={chains} groups={groups} filters={filters} setFilters={setFilters} onOpen={setDetailId} />
        )}
        {tab === 'chaines' && <ChainsTab chains={chains} doneMap={doneMap} onOpen={setDetailId} />}
        {tab === 'reputation' && <ReputationView onOpenQuest={setDetailId} />}
        {tab === 'gains' && <GainsView />}
        {tab === 'editeur' && canEdit && (
          <QuestEditor factions={factions} chains={chains} groups={groups} quests={quests} byId={byId} catalog={catalog} onChanged={refreshAll} />
        )}
      </div>

      <Modal open={detailId != null} onClose={() => setDetailId(null)} title="" width={720}>
        {detail ? (
          <QuestDetail
            quest={detail} byId={byId} factions={factions}
            onComplete={complete} onUncomplete={uncomplete} busy={busy}
            onOpenQuest={(id) => setDetailId(id)}
          />
        ) : <p style={{ color: MUTED }}>Chargement…</p>}
      </Modal>

      <CockpitPanel open={cockpitOpen} onClose={() => setCockpitOpen(false)} />
    </div>
  );
}

function ChainsTab({ chains, doneMap, onOpen }) {
  const [selected, setSelected] = useState(null);
  const [graph, setGraph] = useState(null);
  useEffect(() => {
    const first = chains[0]?.id ?? null;
    setSelected((s) => (s == null ? first : s));
  }, [chains]);
  useEffect(() => {
    if (selected == null) { setGraph(null); return; }
    let alive = true;
    api.quests.chainGraph(selected).then((g) => { if (alive) setGraph(g); });
    return () => { alive = false; };
  }, [selected]);

  if (chains.length === 0) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Aucune chaîne définie pour l'instant.</p>;
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {chains.map((c) => {
          const on = selected === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setSelected(c.id)}
              style={{
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                fontSize: 13, fontWeight: 600,
                background: on ? ACC : 'transparent', color: on ? '#08051a' : MUTED,
                border: on ? 'none' : `1px solid rgba(${ACC_RGB},0.3)`,
              }}
            >⛓ {c.nom}</button>
          );
        })}
      </div>
      {graph ? <ChainGraph graph={graph} done={doneMap} onOpen={onOpen} /> : <p style={{ color: MUTED }}>Chargement…</p>}
    </div>
  );
}

function Banner({ user, canEdit, onCockpit }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', marginBottom: 28,
      background: `linear-gradient(135deg, rgba(60,20,40,0.6), rgba(30,18,55,0.75))`,
      borderBottom: `2px solid rgba(${ACC_RGB},0.3)`,
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        background: `radial-gradient(circle at 15% 20%, rgba(224,82,111,0.25), transparent 40%), radial-gradient(circle at 85% 30%, rgba(232,200,106,0.18), transparent 45%)`,
      }} />
      <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '34px 20px 26px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', color: GOLD }}>
            Nostra · Minefield
          </div>
          <h1 style={{ margin: '4px 0 0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 34, fontWeight: 800, color: INK, letterSpacing: '-0.5px', textShadow: `0 2px 20px rgba(${ACC_RGB},0.3)` }}>
            Journal de quêtes
          </h1>
          <p style={{ margin: '6px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'rgba(214,206,232,0.75)' }}>
            Suivi collaboratif — chaque membre coche sa propre progression.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button" onClick={onCockpit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
              cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
              background: 'rgba(14,9,28,0.72)', color: GOLD, border: `1px solid ${GOLD}`,
            }}
          >🛰️ Cockpit MF</button>
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
