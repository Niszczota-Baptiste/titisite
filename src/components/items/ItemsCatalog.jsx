import { useMemo, useState } from 'react';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { Ecart, PowerGauge } from './PowerBreakdown';
import {
  ACC, ACC_RGB, ACQUISITIONS, INK, LINE, MATERIAU_COULEURS, MUTED, STATUTS,
  VERDICTS, VERDICT_ORDRE, btn, input, panel, pts,
} from './theme';

// Le catalogue : « regarder ce qui a été fait ». Trois axes indépendants —
// les FILTRES retirent des items, le REGROUPEMENT range ceux qui restent, la
// PRÉSENTATION décide de la densité. Les mélanger (un seul menu « voir par… »)
// obligerait à choisir entre « toutes les armes » et « rangé par panoplie ».
//
// Tout se fait en mémoire : le verdict n'existe pas en base (il se recalcule à
// chaque lecture depuis le barème courant), donc aucun filtre serveur ne
// saurait le trier.

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

/** Champs interrogés par la recherche — les mêmes que côté serveur. */
const cherchable = (i) => `${i.nom} ${i.description} ${i.baseItem} ${i.responsable}`.toLowerCase();

export function ItemsCatalog({
  items, referentiel, byId, filtres, setFiltres, verdictF, setVerdictF,
  onOpen, onCreate, canEdit,
}) {
  const [groupe, setGroupe] = useState(() => localStorage.getItem('mf_items_groupe') || 'tier');
  const [vue, setVue] = useState(() => localStorage.getItem('mf_items_vue') || 'cartes');
  const [dense, setDense] = useState(() => localStorage.getItem('mf_items_dense') === '1');

  const retenir = (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch { /* quota */ } };
  const choisirGroupe = (g) => { setGroupe(g); retenir('mf_items_groupe', g); };
  const choisirVue = (v) => { setVue(v); retenir('mf_items_vue', v); };
  const basculerDense = () => setDense((d) => { retenir('mf_items_dense', d ? '0' : '1'); return !d; });

  const liste = useMemo(() => {
    const q = (filtres.q || '').trim().toLowerCase();
    return items.filter((i) => {
      if (q && !cherchable(i).includes(q)) return false;
      if (filtres.tier && String(i.tierId) !== String(filtres.tier)) return false;
      if (filtres.serie && String(i.serieId) !== String(filtres.serie)) return false;
      if (filtres.panoplie && String(i.panoplieId) !== String(filtres.panoplie)) return false;
      if (filtres.statut && i.statut !== filtres.statut) return false;
      if (verdictF && i.puissance.verdict !== verdictF) return false;
      return true;
    });
  }, [items, filtres, verdictF]);

  const sections = useMemo(() => {
    if (groupe === 'aucun') return [['', liste]];
    const map = new Map();
    for (const it of liste) {
      const k = cleGroupe(it, groupe);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    // Les paliers se rangent dans l'ordre du référentiel — alphabétiquement,
    // « Artefact » passerait devant « Commun » et l'échelle perdrait son sens.
    if (groupe === 'tier') {
      const rang = new Map(referentiel.tiers.map((t, n) => [t.nom, n]));
      return [...map.entries()].sort(
        ([a], [b]) => (rang.get(a) ?? 1e6) - (rang.get(b) ?? 1e6) || a.localeCompare(b, 'fr'),
      );
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [liste, groupe, referentiel.tiers]);

  const set = (k, v) => setFiltres((f) => ({ ...f, [k]: v || undefined }));
  const actifs = Object.values(filtres).filter(Boolean).length + (verdictF ? 1 : 0);
  const reinitialiser = () => { setFiltres({}); setVerdictF(''); };

  return (
    <div>
      <div style={{ ...panel, padding: 12, marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 380 }}>
            <span aria-hidden="true" style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: MUTED, fontSize: 13, pointerEvents: 'none',
            }}>⌕</span>
            <input
              value={filtres.q || ''} onChange={(e) => set('q', e.target.value)}
              placeholder="Rechercher un item, une description, un responsable…"
              style={{ ...input, paddingLeft: 28 }}
            />
          </div>
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

        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
          marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}`,
        }}>
          <span style={{ color: MUTED, fontSize: 11.5, marginRight: 2 }}>Ranger par</span>
          {GROUPES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => choisirGroupe(k)}
              style={{ ...btn(groupe === k), padding: '4px 10px', fontSize: 12 }}>{l}</button>
          ))}
          <span style={{ width: 1, height: 18, background: LINE, margin: '0 4px' }} />
          {[['cartes', '▦ Cartes'], ['liste', '☰ Liste']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => choisirVue(k)}
              style={{ ...btn(vue === k), padding: '4px 10px', fontSize: 12 }}>{l}</button>
          ))}
          {vue === 'cartes' ? (
            <button type="button" onClick={basculerDense}
              style={{ ...btn(dense), padding: '4px 10px', fontSize: 12 }}>
              {dense ? '⊟ Compact' : '⊞ Confort'}
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          {actifs ? (
            <button type="button" onClick={reinitialiser}
              style={{ ...btn(), padding: '4px 10px', fontSize: 12, color: MUTED }}>
              ✕ Réinitialiser
            </button>
          ) : null}
          <span style={{ color: MUTED, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {liste.length} / {items.length} item{items.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <Legende verdictF={verdictF} setVerdictF={setVerdictF} items={items} />

      {liste.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 0', opacity: 0.65 }}>
          <p style={{ margin: 0, fontSize: 32 }} aria-hidden="true">🧭</p>
          <p style={{
            margin: '10px 0 0', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15,
            fontWeight: 600, color: INK,
          }}>Aucun item ne correspond</p>
          <p style={{ margin: '5px 0 0', color: MUTED, fontSize: 12.5 }}>
            Assouplis les filtres pour élargir la recherche.
          </p>
        </div>
      ) : sections.map(([titre, sousListe]) => (
        <section key={titre || 'tout'} style={{ marginBottom: 22 }}>
          {titre ? (
            <EnteteGroupe titre={titre} items={sousListe} axe={groupe} referentiel={referentiel} />
          ) : null}
          {vue === 'cartes' ? (
            <div style={{
              display: 'grid', gap: dense ? 8 : 10, alignItems: 'stretch',
              gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 232 : 268}px, 1fr))`,
            }}>
              {sousListe.map((it) => (
                <ItemCard key={it.id} item={it} byId={byId} dense={dense} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 3 }}>
              {sousListe.map((it) => <ItemRow key={it.id} item={it} byId={byId} onOpen={onOpen} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * La légende, qui est aussi le filtre par verdict : montrer ce que veut dire
 * chaque couleur et permettre de ne garder que celle-là est le même geste.
 */
function Legende({ verdictF, setVerdictF, items }) {
  const compte = useMemo(() => {
    const c = {};
    for (const i of items) c[i.puissance.verdict] = (c[i.puissance.verdict] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div style={{
      display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
      padding: '10px 4px 14px', fontSize: 11, color: MUTED,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 2, height: 11, background: 'rgba(255,255,255,0.55)' }} />
        budget du palier
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 16, height: 6, borderRadius: 3, background: `${VERDICTS.ok.color}33` }} />
        zone tolérée
      </span>
      <span style={{ width: 1, height: 14, background: LINE }} />
      {VERDICT_ORDRE.filter((k) => compte[k]).map((k) => {
        const v = VERDICTS[k];
        const actif = verdictF === k;
        return (
          <button
            key={k} type="button" onClick={() => setVerdictF(actif ? '' : k)}
            title={actif ? 'Retirer ce filtre' : `Ne garder que « ${v.label} »`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '3px 9px', borderRadius: 999, fontSize: 11,
              fontFamily: "'Inter',sans-serif",
              border: `1px solid ${actif ? `${v.color}88` : LINE}`,
              background: actif ? `${v.color}1a` : 'transparent',
              color: actif ? v.color : MUTED,
            }}
          >
            <span style={{ width: 16, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${v.color}88, ${v.color})` }} />
            {v.label}
            <span style={{ color: actif ? v.color : MUTED, opacity: 0.75 }}>{compte[k]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * En-tête d'un groupe. Sur un palier il porte le budget et la moyenne observée :
 * c'est là qu'on voit qu'un palier entier penche, ce qu'aucune carte prise
 * séparément ne dirait.
 */
function EnteteGroupe({ titre, items, axe, referentiel }) {
  const tier = axe === 'tier' ? referentiel.tiers.find((t) => t.nom === titre) : null;
  const couleur = tier?.couleur
    || (axe === 'serie' ? referentiel.series.find((s) => titre.startsWith(`${s.code} —`))?.couleur : null)
    || (axe === 'panoplie' ? referentiel.panoplies.find((p) => p.nom === titre)?.couleur : null)
    || ACC;

  // La moyenne exclut les fiches à compléter : une fiche vide pèse 0 et
  // tirerait la moyenne du palier vers le bas sans rien dire de son équilibre.
  const documentes = items.filter((i) => i.puissance.verdict !== 'incomplet');
  const moyenne = documentes.length
    ? documentes.reduce((s, i) => s + i.puissance.total, 0) / documentes.length : null;

  const compte = {};
  for (const i of items) compte[i.puissance.verdict] = (compte[i.puissance.verdict] || 0) + 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: couleur, boxShadow: `0 0 9px ${couleur}` }} />
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 700, color: couleur,
        }}>{titre}</span>
        <span style={{ color: MUTED, fontSize: 12 }}>· {items.length}</span>
      </span>
      {tier ? (
        <span style={{ color: MUTED, fontSize: 11 }}>
          budget <strong style={{ color: INK, fontWeight: 600 }}>{pts(tier.budget)}</strong>
          {' · '}moy. <strong style={{ color: INK, fontWeight: 600 }}>{moyenne == null ? '—' : pts(moyenne)}</strong>
          {' · '}{tier.echelle}
        </span>
      ) : null}
      <span style={{ display: 'flex', gap: 9, marginLeft: 'auto', alignItems: 'center' }}>
        {VERDICT_ORDRE.filter((k) => compte[k]).map((k) => (
          <span key={k} title={VERDICTS[k].label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: VERDICTS[k].color }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: VERDICTS[k].color }} />
            {compte[k]}
          </span>
        ))}
      </span>
      <div style={{ flexBasis: '100%', height: 1, background: `linear-gradient(90deg, ${couleur}44, transparent)` }} />
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

function ItemCard({ item, byId, dense, onOpen }) {
  const [survol, setSurvol] = useState(false);
  const v = VERDICTS[item.puissance.verdict] || VERDICTS.inconnu;
  const st = STATUTS[item.statut] || STATUTS.a_tester;
  const couleurMat = MATERIAU_COULEURS[item.puissance.famille] || MATERIAU_COULEURS.autre;
  const bord = item.tierCouleur || couleurMat;

  return (
    <button
      type="button" onClick={() => onOpen(item.id)}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)} onBlur={() => setSurvol(false)}
      style={{
        ...panel, padding: dense ? '10px 11px' : 12, textAlign: 'left', cursor: 'pointer',
        // hauteur 100 % + colonne : sans ça les blocs puissance d'une même
        // rangée flottent à des hauteurs différentes et ne se comparent plus.
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: dense ? 7 : 8,
        borderLeft: `3px solid ${bord}`,
        background: survol ? `linear-gradient(135deg, ${bord}0f, rgba(16,11,30,0.95))` : panel.background,
        borderColor: survol ? `${bord}55` : LINE,
        transform: survol ? 'translateY(-2px)' : 'none',
        boxShadow: survol ? '0 12px 30px rgba(0,0,0,0.45)' : 'none',
        transition: 'transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s, background .2s, border-color .2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <CodexItem byId={byId} id={item.baseItem} size={dense ? 22 : 26} showName={false} />
        <span style={{
          flex: 1, minWidth: 0, color: INK, fontSize: dense ? 12.5 : 13.5, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.nom}</span>
        <span title={st.label} style={{ fontSize: 12, flexShrink: 0 }}>{st.icon}</span>
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

      {!dense && item.description ? (
        <p style={{
          margin: 0, color: MUTED, fontSize: 11.5, lineHeight: 1.45, flex: '1 0 auto',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{item.description}</p>
      ) : null}

      {/* marginTop auto : le bloc puissance se colle en pied, donc les jauges
          d'une rangée s'alignent quelle que soit la longueur des descriptions. */}
      <div style={{
        marginTop: 'auto', padding: dense ? '8px 9px' : '9px 10px', borderRadius: 9,
        background: 'rgba(0,0,0,0.28)', border: `1px solid ${LINE}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 7 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: dense ? 18 : 21, fontWeight: 700,
            color: v.color, lineHeight: 1,
          }}>{pts(item.puissance.total)}</span>
          <span style={{ color: MUTED, fontSize: 10 }}>
            {item.puissance.budget ? `/ ${pts(item.puissance.budget)} pts` : 'pts'}
          </span>
          <span style={{ flex: 1 }} />
          <Ecart puissance={item.puissance} />
        </div>
        {/* L'écart dit « de combien », le verdict dit « quoi en faire ». Le
            pourcentage de la jauge répéterait l'écart en le disant autrement. */}
        <PowerGauge puissance={item.puissance} compact libelle="aucun" />
        {!dense ? (
          <p style={{ margin: '6px 0 0', color: v.color, fontSize: 10, opacity: 0.85 }}>
            {v.icon} {v.label.toLowerCase()}
          </p>
        ) : null}
      </div>
    </button>
  );
}

/**
 * La vue liste : la même population, mais alignée en colonnes. C'est celle
 * qu'on veut pour comparer trente pièces d'un palier — trente cartes obligent
 * à balayer, trente lignes se lisent d'un coup d'œil.
 */
function ItemRow({ item, byId, onOpen }) {
  const [survol, setSurvol] = useState(false);
  const v = VERDICTS[item.puissance.verdict] || VERDICTS.inconnu;
  const st = STATUTS[item.statut] || STATUTS.a_tester;
  const bord = item.tierCouleur || MATERIAU_COULEURS[item.puissance.famille] || MATERIAU_COULEURS.autre;

  return (
    <button
      type="button" onClick={() => onOpen(item.id)}
      onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)} onBlur={() => setSurvol(false)}
      style={{
        display: 'grid', width: '100%', textAlign: 'left', cursor: 'pointer',
        gridTemplateColumns: 'auto minmax(0,2.2fr) minmax(0,110px) 66px minmax(110px,1fr) auto auto',
        gap: 10, alignItems: 'center', padding: '7px 11px', borderRadius: 8,
        border: `1px solid ${LINE}`, borderLeft: `3px solid ${bord}`,
        background: survol ? 'rgba(22,15,38,0.9)' : 'rgba(255,255,255,0.02)',
        transition: 'background .16s',
      }}
    >
      <CodexItem byId={byId} id={item.baseItem} size={20} showName={false} />
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', color: INK, fontSize: 12.5, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.nom}</span>
        {item.panoplieNom ? (
          <span style={{ color: MUTED, fontSize: 10 }}>⛓ {item.panoplieNom}</span>
        ) : null}
      </span>
      <span style={{
        color: item.tierCouleur || MUTED, fontSize: 11.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.tierNom || '—'}</span>
      <span style={{ color: MUTED, fontSize: 11 }}>{item.serieCode ? `Série ${item.serieCode}` : '—'}</span>
      <PowerGauge puissance={item.puissance} compact libelle="aucun" />
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
          color: v.color, fontVariantNumeric: 'tabular-nums',
        }}>{pts(item.puissance.total)}</span>
        <Ecart puissance={item.puissance} size={10} />
      </span>
      <span title={st.label} style={{ fontSize: 11 }}>{st.icon}</span>
    </button>
  );
}

function Pastille({ children, couleur }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 999, fontSize: 10.5, whiteSpace: 'nowrap',
      border: `1px solid ${couleur ? `${couleur}55` : LINE}`,
      background: couleur ? `${couleur}14` : `rgba(${ACC_RGB},0.03)`,
      color: couleur || MUTED,
    }}>{children}</span>
  );
}
