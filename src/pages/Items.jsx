import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCodex } from '../hooks/useCodex';
import { usePageMeta } from '../hooks/usePageMeta';
import { Login } from '../components/admin/Login';
import { Modal } from '../components/project/shared';
import { BalanceTab } from '../components/items/BalanceTab';
import { CmdTab } from '../components/items/CmdTab';
import { ItemForm } from '../components/items/ItemForm';
import { ItemSheet } from '../components/items/ItemSheet';
import { ItemsCatalog } from '../components/items/ItemsCatalog';
import { RefTab } from '../components/items/RefTab';
import { ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, btn } from '../components/items/theme';

// Base des items customs Minefield — module global, même patron de page que
// /quetes et /lore : gate d'accès, bandeau, onglets, tout le reste en dessous.
//
// Les quatre onglets suivent les trois objectifs écrits dans le document
// d'origine : recenser ce qui existe (Catalogue), garder un œil sur les CMD
// pour le resource pack (CMD), et servir d'exemple aux futurs scribes — ce
// dernier point supposant qu'on puisse dire si un item est équilibré ou non,
// d'où l'onglet Équilibrage et le Référentiel qui règle son barème.

export default function Items() {
  const { user, loading } = useAuth();
  usePageMeta('Items customs Minefield');

  if (loading) return <div style={plein}><p style={{ color: MUTED }}>Chargement…</p></div>;
  if (!user) {
    return <Login title="Items customs" subtitle="Connecte-toi pour ouvrir la base des items Minefield." />;
  }
  if (!user.canViewItems) {
    return (
      <div style={plein}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: INK }}>
          Accès refusé
        </h1>
        <p style={{ color: MUTED }}>Ton compte n'a pas accès à la base des items customs.</p>
        <Link to="/" style={{ color: ACC, textDecoration: 'none', marginTop: 12 }}>← Retour</Link>
      </div>
    );
  }
  return <ItemsApp user={user} />;
}

const TABS = [
  ['catalogue', '📦 Catalogue'],
  ['equilibrage', '⚖️ Équilibrage'],
  ['cmd', '🎨 CMD'],
  ['referentiel', '⚙️ Référentiel'],
];

function ItemsApp({ user }) {
  const { catalog, byId } = useCodex();
  const [tab, setTab] = useState(() => {
    const voulu = new URLSearchParams(window.location.search).get('tab');
    return TABS.some(([k]) => k === voulu) ? voulu : 'catalogue';
  });
  const [referentiel, setReferentiel] = useState(null);
  const [items, setItems] = useState([]);
  const [filtres, setFiltres] = useState({});
  const [detailId, setDetailId] = useState(null);
  const [edition, setEdition] = useState(null); // { item: null | item }
  const [err, setErr] = useState(null);
  const canEdit = !!user.canEditItems;

  // Projet d'origine (lien « 🧪 Items » de l'onglet Minecraft → ?projet=<slug>),
  // mémorisé en session comme sur /quetes et /lore.
  const depuisProjet = useMemo(() => {
    const brut = new URLSearchParams(window.location.search).get('projet');
    const slug = brut && /^[a-z0-9-]{1,64}$/.test(brut) ? brut : null;
    if (slug) sessionStorage.setItem('items_from_project', slug);
    return slug || sessionStorage.getItem('items_from_project');
  }, []);

  const chargerRef = useCallback(
    () => api.items.ref().then(setReferentiel).catch((e) => setErr(e.message)),
    [],
  );
  // Les onglets Équilibrage et CMD raisonnent sur TOUT le catalogue : leur
  // appliquer les filtres du catalogue ferait mentir les moyennes par palier
  // et les trous de numérotation. Seul l'onglet Catalogue filtre.
  const chargerItems = useCallback(
    () => api.items.list(tab === 'catalogue' ? filtres : {}).then(setItems).catch((e) => setErr(e.message)),
    [filtres, tab],
  );

  useEffect(() => { chargerRef(); }, [chargerRef]);
  useEffect(() => { chargerItems(); }, [chargerItems]);

  const detail = useMemo(() => items.find((i) => i.id === detailId) || null, [items, detailId]);

  const rafraichir = useCallback(async () => {
    await Promise.all([chargerRef(), chargerItems()]);
  }, [chargerRef, chargerItems]);

  const supprimer = useCallback(async (id) => {
    try {
      await api.items.remove(id);
      setDetailId(null);
      await rafraichir();
    } catch (e) { setErr(e.message); }
  }, [rafraichir]);

  if (!referentiel) {
    return <div style={plein}><p style={{ color: MUTED }}>Chargement du référentiel…</p></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050511', paddingBottom: 60 }}>
      <header style={{
        padding: '22px 20px 0', maxWidth: 1280, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{
            margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 22,
            fontWeight: 700, color: INK,
          }}>
            🧪 Items customs <span style={{ color: GOLD }}>Minefield</span>
          </h1>
          <span style={{ color: MUTED, fontSize: 12.5 }}>
            {items.length} item{items.length > 1 ? 's' : ''} · {referentiel.tiers.length} paliers ·
            {' '}{referentiel.series.length} séries
          </span>
          <span style={{ flex: 1 }} />
          {depuisProjet ? (
            <Link to={`/project/${depuisProjet}/minecraft`} style={{
              ...btn(), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>⛏️ ← Retour au projet</Link>
          ) : null}
        </div>
        <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 12.5, lineHeight: 1.6, maxWidth: 760 }}>
          Le recensement des objets customs du serveur : ce qui existe, qui l'a fait, ce qu'il
          coûte à obtenir et ce qu'il vaut en puissance. La puissance est <em>calculée</em> à
          partir du matériau, des attributs et des enchantements ; le palier ne la modifie pas,
          il lui donne un budget à respecter.
        </p>

        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 14px' }}>
          {TABS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={btn(tab === k)}>{l}</button>
          ))}
        </nav>

        {err ? (
          <p style={{
            padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 12,
            border: `1px solid ${CRIMSON}55`, background: `${CRIMSON}14`, color: CRIMSON,
          }}>
            {err}
            <button type="button" onClick={() => setErr(null)} style={{ ...btn(), marginLeft: 10, padding: '2px 8px', fontSize: 11.5 }}>×</button>
          </p>
        ) : null}
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 20px' }}>
        {tab === 'catalogue' ? (
          <ItemsCatalog
            items={items} referentiel={referentiel} byId={byId}
            filtres={filtres} setFiltres={setFiltres}
            onOpen={setDetailId} onCreate={() => setEdition({ item: null })} canEdit={canEdit}
          />
        ) : null}
        {tab === 'equilibrage' ? (
          <BalanceTab items={items} referentiel={referentiel} onOpen={setDetailId} />
        ) : null}
        {tab === 'cmd' ? (
          <CmdTab items={items} referentiel={referentiel} byId={byId} onOpen={setDetailId} />
        ) : null}
        {tab === 'referentiel' ? (
          <RefTab referentiel={referentiel} canEdit={canEdit} onChanged={rafraichir} />
        ) : null}
      </main>

      <Modal open={!!detail} onClose={() => setDetailId(null)} title={detail?.nom || ''} width={1080}>
        {detail ? (
          <ItemSheet
            item={detail} referentiel={referentiel} byId={byId} canEdit={canEdit}
            onEdit={() => { setEdition({ item: detail }); setDetailId(null); }}
            onDelete={() => supprimer(detail.id)}
          />
        ) : null}
      </Modal>

      <Modal
        open={!!edition} onClose={() => setEdition(null)} width={1080}
        title={edition?.item ? `Modifier « ${edition.item.nom} »` : 'Nouvel item custom'}
      >
        {edition ? (
          <ItemForm
            item={edition.item} referentiel={referentiel} catalog={catalog} byId={byId}
            onCancel={() => setEdition(null)}
            onSaved={async (sauve) => {
              setEdition(null);
              await rafraichir();
              setDetailId(sauve.id);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

const plein = {
  minHeight: '100vh', background: '#050511', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20,
  boxShadow: `inset 0 0 200px rgba(${ACC_RGB},0.05)`,
};
