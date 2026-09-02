import { useMemo, useState } from 'react';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { PowerGauge } from './PowerBreakdown';
import {
  ACC, ACQUISITIONS, INK, LINE, MATERIAU_COULEURS, MUTED, STATUTS, VERDICTS,
  btn, input, panel, pts,
} from './theme';

// Le catalogue : « regarder ce qui a été fait ». Deux axes indépendants —
// les FILTRES retirent des items, le REGROUPEMENT range ceux qui restent.
// Les mélanger (un seul menu « voir par… ») obligerait à choisir entre
// « toutes les armes » et « rangé par panoplie ».

const GROUPES = [
  ['tier', 'Palier'],
  ['serie', 'Série'],
  ['panoplie', 'Panoplie'],
  ['statut', 'Statut'],
  ['acquisition', 'Acquisition'],
  ['aucun', 'À plat'],
];

const cleGroupe = (item, axe) => {
  switch (axe) {
    case 'tier': return item.tierNom || 'Sans palier';
    case 'serie': return item.serieNom ? `${item.serieCode} — ${item.serieNom}` : 'Sans série';
    case 'panoplie': return item.panoplieNom || 'Hors panoplie';
    case 'statut': return STATUTS[item.statut]?.label || item.statut;
    case 'acquisition': return ACQUISITIONS[item.acquisition]?.label || item.acquisition;
    default: return '';
  }
};

export function ItemsCatalog({
  items, referentiel, byId, filtres, setFiltres, onOpen, onCreate, canEdit,
}) {
  const [groupe, setGroupe] = useState(() => localStorage.getItem('mf_items_groupe') || 'tier');
  const choisirGroupe = (g) => { setGroupe(g); try { localStorage.setItem('mf_items_groupe', g); } catch { /* quota */ } };

  const sections = useMemo(() => {
    if (groupe === 'aucun') return [['', items]];
    const map = new Map();
    for (const it of items) {
      const k = cleGroupe(it, groupe);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()];
  }, [items, groupe]);

  const set = (k, v) => setFiltres((f) => ({ ...f, [k]: v || undefined }));

  return (
    <div>
      <div style={{ ...panel, padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={filtres.q || ''} onChange={(e) => set('q', e.target.value)}
            placeholder="Rechercher un item, une description, un responsable…"
            style={{ ...input, flex: '1 1 240px', maxWidth: 380 }}
          />
          <Select value={filtres.tier} onChange={(v) => set('tier', v)} vide="Tous les paliers"
            options={referentiel.tiers.map((t) => [t.id, `${t.nom} (${t.items})`])} />
          <Select value={filtres.serie} onChange={(v) => set('serie', v)} vide="Toutes les séries"
            options={referentiel.series.map((s) => [s.id, `${s.code} — ${s.nom}`])} />
          <Select value={filtres.panoplie} onChange={(v) => set('panoplie', v)} vide="Toutes les panoplies"
            options={referentiel.panoplies.map((p) => [p.id, p.nom])} />
          <Select value={filtres.statut} onChange={(v) => set('statut', v)} vide="Tous les statuts"
            options={referentiel.statuts.map((s) => [s.cle, s.label])} />
          {canEdit ? (
            <button type="button" onClick={onCreate} style={{ ...btn(true), marginLeft: 'auto' }}>
              ➕ Nouvel item
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <span style={{ color: MUTED, fontSize: 11.5, marginRight: 4 }}>Ranger par</span>
          {GROUPES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => choisirGroupe(k)}
              style={{ ...btn(groupe === k), padding: '4px 10px', fontSize: 12 }}>{l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ color: MUTED, fontSize: 12 }}>
            {items.length} item{items.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          Aucun item ne correspond à ces filtres.
        </p>
      ) : sections.map(([titre, liste]) => (
        <section key={titre || 'tout'} style={{ marginBottom: 22 }}>
          {titre ? (
            <h3 style={{
              margin: '0 0 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
              fontWeight: 600, color: ACC, letterSpacing: '0.03em',
            }}>
              {titre} <span style={{ color: MUTED, fontWeight: 400 }}>· {liste.length}</span>
            </h3>
          ) : null}
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
          }}>
            {liste.map((it) => <ItemCard key={it.id} item={it} byId={byId} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Select({ value, onChange, options, vide }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}
      style={{ ...input, width: 'auto', minWidth: 130, cursor: 'pointer' }}>
      <option value="">{vide}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function ItemCard({ item, byId, onOpen }) {
  const v = VERDICTS[item.puissance.verdict] || VERDICTS.inconnu;
  const st = STATUTS[item.statut] || STATUTS.a_tester;
  const couleurMat = MATERIAU_COULEURS[item.puissance.famille] || MATERIAU_COULEURS.autre;
  return (
    <button
      type="button" onClick={() => onOpen(item.id)}
      style={{
        ...panel, padding: 12, textAlign: 'left', cursor: 'pointer', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 8,
        borderLeft: `3px solid ${item.tierCouleur || couleurMat}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <CodexItem byId={byId} id={item.baseItem} size={26} showName={false} />
        <span style={{
          flex: 1, minWidth: 0, color: INK, fontSize: 13.5, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.nom}</span>
        <span title={st.label} style={{ fontSize: 12 }}>{st.icon}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {item.tierNom ? <Pastille couleur={item.tierCouleur}>{item.tierNom}</Pastille> : null}
        {/* La série n'est pas décorative : l'onglet Nostra du classeur reprend
            les pièces de la guilde d'explorateurs sous les mêmes noms, et sans
            elle deux cartes identiques seraient indiscernables. */}
        {item.serieCode ? <Pastille couleur={MUTED}>Série {item.serieCode}</Pastille> : null}
        {item.panoplieNom ? <Pastille couleur={item.panoplieCouleur}>{item.panoplieNom}</Pastille> : null}
        {item.cmd ? <Pastille couleur={MUTED}>CMD {item.cmd}</Pastille> : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: v.color, fontSize: 15, fontWeight: 700, minWidth: 44 }}>
          {pts(item.puissance.total)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PowerGauge puissance={item.puissance} compact />
        </div>
      </div>

      {item.description ? (
        <p style={{
          margin: 0, color: MUTED, fontSize: 11.5, lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{item.description}</p>
      ) : null}
    </button>
  );
}

function Pastille({ children, couleur }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 999, fontSize: 10.5, whiteSpace: 'nowrap',
      border: `1px solid ${couleur ? `${couleur}55` : LINE}`,
      background: couleur ? `${couleur}14` : 'rgba(255,255,255,0.03)',
      color: couleur || MUTED,
    }}>{children}</span>
  );
}
