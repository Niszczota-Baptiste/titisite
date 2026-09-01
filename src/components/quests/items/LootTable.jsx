import { useMemo, useState } from 'react';
import { CodexItem } from '../../admin/editors/minecraft/CodexPicker';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, PROBA_SOURCES, hexToRgb, panel,
} from '../theme';
import {
  croiserObservations, esperance, formatPrix, lignesRetenues, probaDe, reliquat,
  sommeProbabilites, uniteLabel, verdictOuvrir,
} from './loot';

// Lecture d'une table de butin : lignes triées par probabilité décroissante,
// barre de proportion, badge de provenance de la probabilité, taux observé —
// puis le panneau « vendre ou ouvrir ? », qui est le point de la page.
//
// Le % qui fait foi est CELUI DES OUVERTURES dès qu'il y en a (voir loot.js) :
// le serveur ne publie pas ses tables, la colonne saisie à la main n'est qu'une
// supposition. Elle reste affichée en petit — l'écart entre supposé et mesuré
// est justement ce qu'on vient vérifier — et la bascule « Déclaré » permet de
// revenir à la table saisie.

const VERDICTS = {
  ouvrir:     { label: 'Plutôt ouvrir',  icon: '🔓', color: '#7be3a8' },
  vendre:     { label: 'Plutôt vendre',  icon: '🪙', color: GOLD },
  equivalent: { label: 'Équivalent',     icon: '⚖️', color: ACC },
};

// Ce que vaut un échantillon d'ouvertures, en une phrase.
const FIABILITES = {
  faible:  { color: GOLD, texte: 'échantillon encore mince — les taux bougeront' },
  moyenne: { color: '#7bd3e8', texte: 'échantillon correct, à confirmer' },
  bonne:   { color: '#7be3a8', texte: 'échantillon solide' },
};

const pct = (v) => `${Math.round(v * 10) / 10} %`;

export function LootTable({ item, byId, itemsById, observations, onOpenItem }) {
  const loot = item.loot || [];
  const [mode, setMode] = useState('auto'); // 'auto' (observé si relevés) | 'declare'
  const croisement = useMemo(
    () => croiserObservations(loot, observations, { mode, itemsById }),
    [loot, observations, mode, itemsById],
  );
  const { inattendus, total, base } = croisement;
  const retenues = useMemo(() => lignesRetenues(croisement), [croisement]);
  const triees = useMemo(
    () => [...retenues].sort((a, b) => probaDe(b) - probaDe(a)),
    [retenues],
  );
  const somme = sommeProbabilites(retenues);
  const manque = reliquat(retenues);
  const maxP = Math.max(1, ...retenues.map(probaDe));

  if (loot.length === 0 && total === 0) {
    return (
      <p style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED }}>
        Table de butin vide — ajoute les résultats au fur et à mesure de tes ouvertures.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <BaseSwitch
        base={base} total={total} fiab={croisement.fiabilite}
        mode={mode} onMode={setMode} declarees={loot.length}
      />

      <div style={{ display: 'grid', gap: 5 }}>
        {triees.map((l, i) => (
          <LootRow
            key={l.id ?? l.key ?? i} ligne={l} maxP={maxP} base={base} byId={byId}
            itemsById={itemsById} onOpenItem={onOpenItem}
          />
        ))}
      </div>

      {/* Contrôle de cohérence — signalé, jamais bloquant. */}
      <SommeBanner somme={somme} manque={manque} base={base} total={total} />

      {inattendus.length > 0 && (
        <div style={{
          ...panel, padding: '9px 12px', borderColor: 'rgba(232,200,106,0.35)',
          fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: GOLD,
        }}>
          ⚠️ Obtenu en jeu mais absent de la table déclarée :{' '}
          {inattendus.map((o) => `${o.label} (${o.n}× sur ${total})`).join(', ')} —{' '}
          {base === 'observee'
            ? `${inattendus.length > 1 ? 'ces lignes comptent' : 'cette ligne compte'} déjà dans le calcul ; ajoute-${inattendus.length > 1 ? 'les' : 'la'} à la table pour leur donner un prix.`
            : `pense à ${inattendus.length > 1 ? 'les' : "l'"}ajouter.`}
        </div>
      )}

      <EsperancePanel item={item} loot={retenues} itemsById={itemsById} base={base} total={total} />
    </div>
  );
}

// « D'où vient le % ? » — la question centrale de la page, donc elle est posée
// en clair au-dessus de la table plutôt que cachée dans un badge par ligne.
function BaseSwitch({ base, total, fiab, mode, onMode, declarees }) {
  const observe = base === 'observee';
  const couleur = observe ? '#7bd3e8' : GOLD;
  const meta = FIABILITES[fiab];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 11px', borderRadius: 9,
      background: `rgba(${hexToRgb(couleur)},0.08)`,
      border: `1px solid rgba(${hexToRgb(couleur)},0.32)`,
      fontFamily: "'Inter',sans-serif", fontSize: 12.5,
    }}>
      <span style={{ color: couleur, fontWeight: 700 }}>
        {observe ? '📊 Taux observés' : '✎ Table déclarée'}
      </span>
      <span style={{ color: 'rgba(214,206,232,0.85)', flex: 1, minWidth: 200 }}>
        {observe ? (
          <>
            calculés sur <strong style={{ color: INK }}>{total}</strong> ouverture{total > 1 ? 's' : ''} relevée{total > 1 ? 's' : ''}
            {meta && <span style={{ color: meta.color }}> — {meta.texte}</span>}
          </>
        ) : total > 0 ? (
          <>les {total} ouverture{total > 1 ? 's' : ''} relevée{total > 1 ? 's' : ''} sont ignorée{total > 1 ? 's' : ''} dans ce mode.</>
        ) : (
          <>aucune ouverture relevée : les % affichés sont ceux saisis à la main, donc supposés.</>
        )}
      </span>
      {total > 0 && declarees > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {[['auto', '📊 Observé'], ['declare', '✎ Déclaré']].map(([k, label]) => {
            const on = mode === k;
            return (
              <button
                key={k} type="button" onClick={() => onMode(k)}
                title={k === 'auto'
                  ? 'Les taux mesurés au fil des ouvertures font foi'
                  : 'Revenir aux probabilités saisies dans la fiche'}
                style={{
                  padding: '4px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5,
                  fontFamily: "'Inter',sans-serif", fontWeight: 600,
                  background: on ? couleur : 'transparent', color: on ? '#08051a' : MUTED,
                  border: on ? 'none' : '1px solid rgba(80,50,130,0.35)',
                }}
              >{label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// `mot` : ce qu'on a compté — une « ouverture » pour un contenant, un
// « tirage » pour une quête. Le même bandeau sert les deux.
export function SommeBanner({ somme, manque, base = 'declaree', total = 0, mot = 'ouverture' }) {
  const exact = Math.abs(somme - 100) < 0.01;
  const couleur = exact ? '#7be3a8' : (somme > 100 ? CRIMSON : GOLD);
  // En base observée la somme vaut 100 % par construction (c'est une
  // répartition) : le dire autrement ferait croire à une coïncidence.
  if (base === 'observee') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '7px 11px', borderRadius: 8,
        background: 'rgba(123,211,232,0.08)', border: '1px solid rgba(123,211,232,0.32)',
        fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: '#7bd3e8',
      }}>
        <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>Σ {pct(somme)}</strong>
        <span style={{ color: 'rgba(214,206,232,0.85)' }}>
          répartition mesurée sur {total} {mot}{total > 1 ? 's' : ''} — elle somme à 100 % par
          construction, chaque {mot} ayant donné exactement un résultat.
        </span>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '7px 11px', borderRadius: 8,
      background: `rgba(${hexToRgb(couleur)},0.08)`,
      border: `1px solid rgba(${hexToRgb(couleur)},0.35)`,
      fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: couleur,
    }}>
      <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>Σ {pct(somme)}</strong>
      {exact && <span>table complète</span>}
      {!exact && somme < 100 && (
        <span style={{ color: 'rgba(214,206,232,0.85)' }}>
          il manque {pct(manque)} — soit des résultats non encore relevés, soit un reliquat
          « rien / commun » à déclarer.
        </span>
      )}
      {somme > 100 && (
        <span style={{ color: 'rgba(214,206,232,0.85)' }}>
          dépassement : certaines probabilités sont trop hautes (ou une ligne fait doublon).
        </span>
      )}
    </div>
  );
}

function LootRow({ ligne, maxP, base, byId, itemsById, onOpenItem }) {
  const observe = base === 'observee';
  const src = PROBA_SOURCES[ligne.probabiliteSource] || PROBA_SOURCES.estimee;
  const cible = ligne.resultatUniqueId ? itemsById?.get(ligne.resultatUniqueId) : null;
  const couleur = cible?.rarete?.couleur || ligne.cibleRareteCouleur || ACC;
  const qMin = ligne.quantiteMin ?? null;
  const qMax = ligne.quantiteMax ?? qMin;
  const obs = ligne.observations;
  const proba = probaDe(ligne);
  // La valeur saisie n'est rappelée que si elle contredit la mesure : sinon
  // c'est du bruit sur chaque ligne.
  const ecartDeclare = observe && ligne.probabiliteDeclaree != null
    && Math.abs(ligne.probabiliteDeclaree - proba) > 1;
  // Une ligne déclarée jamais tirée n'est pas « sans donnée » : c'est 0 sur n.
  const jamaisVue = observe && !obs;

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
      background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
      borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
      opacity: jamaisVue ? 0.55 : 1,
    }}>
      {/* barre de proportion, en fond */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, width: `${(proba / maxP) * 100}%`,
        background: `linear-gradient(90deg, rgba(${hexToRgb(couleur)},0.20), rgba(${hexToRgb(couleur)},0.04))`,
        pointerEvents: 'none',
      }} />

      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {ligne.resultatType === 'unique_item' && cible?.baseItemId ? (
          <CodexItem byId={byId} id={cible.baseItemId} size={20} showName={false} />
        ) : ligne.resultatType === 'item_referentiel' && ligne.resultatRef ? (
          <CodexItem byId={byId} id={ligne.resultatRef} size={20} showName={false} />
        ) : (
          <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>
            {ligne.resultatType === 'pa' ? '🪙'
              : ligne.resultatType === 'reputation' ? '⚜️'
                // Un item unique sans item support garde l'icône d'objet.
                : ligne.resultatType === 'unique_item' ? '📦' : '•'}
          </span>
        )}
        {cible && onOpenItem ? (
          <button type="button" onClick={() => onOpenItem(cible.id)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: couleur, fontWeight: 600, fontSize: 13, fontFamily: "'Inter',sans-serif",
            textAlign: 'left', textDecoration: 'underline', textDecorationStyle: 'dotted',
          }}>{ligne.label}</button>
        ) : (
          <span style={{ fontWeight: cible ? 600 : 400, color: cible ? couleur : INK }}>{ligne.label}</span>
        )}
        <span style={{ color: MUTED, fontSize: 11.5, whiteSpace: 'nowrap' }}>
          {qMin != null
            ? `×${qMin}${qMax !== qMin ? `–${qMax}` : ''}`
            : `×${Math.round((ligne.quantiteMoyenneObservee ?? 1) * 100) / 100} moy.`}
        </span>
        {ligne.probabiliteDeclaree === 0 && ligne.id == null && (
          <span title="Résultat relevé en jeu mais absent de la table déclarée" style={{
            fontSize: 10, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap',
            border: `1px solid rgba(${hexToRgb(GOLD)},0.4)`, borderRadius: 999, padding: '0 6px',
          }}>hors table</span>
        )}
      </span>

      {ecartDeclare && (
        <span title="Probabilité saisie à la main — la mesure la contredit"
          style={{
            position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            color: MUTED, whiteSpace: 'nowrap', textDecoration: 'line-through',
          }}
        >{pct(ligne.probabiliteDeclaree)}</span>
      )}

      {obs ? (
        <span
          title={`${obs.k} sur ${obs.n} ouvertures — intervalle de confiance 95 % : ${pct(obs.bas)} à ${pct(obs.haut)}`}
          style={{
            position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            color: '#7bd3e8', whiteSpace: 'nowrap',
          }}
        >
          {obs.k}/{obs.n} <span style={{ opacity: 0.6 }}>[{Math.round(obs.bas)}–{Math.round(obs.haut)}]</span>
        </span>
      ) : jamaisVue && (
        <span title="Jamais obtenu sur les ouvertures relevées" style={{
          position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          color: MUTED, whiteSpace: 'nowrap',
        }}>jamais vue</span>
      )}

      <span
        title={observe ? 'Taux mesuré sur les ouvertures relevées' : src.title}
        style={{
          position: 'relative', padding: '1px 7px', borderRadius: 999, fontSize: 10,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
          color: observe ? '#7bd3e8' : src.color,
          background: `rgba(${hexToRgb(observe ? '#7bd3e8' : src.color)},0.12)`,
          border: `1px solid rgba(${hexToRgb(observe ? '#7bd3e8' : src.color)},0.4)`,
          whiteSpace: 'nowrap',
        }}
      >{observe ? 'mesuré' : src.short}</span>

      <strong style={{
        position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
        color: couleur, minWidth: 54, textAlign: 'right',
      }}>{pct(proba)}</strong>
    </div>
  );
}

// « Vendre ou ouvrir ? » — verdict lisible + détail du calcul dépliable.
// Exporté pour que l'éditeur affiche le MÊME verdict en direct pendant la saisie.
export function EsperancePanel({ item, loot, itemsById, base = 'declaree', total = 0 }) {
  const [ouvert, setOuvert] = useState(false);
  const calc = useMemo(() => esperance(item, loot), [item, loot]);
  const v = verdictOuvrir({ valeur: calc.valeur, prixVente: item.prixVente });
  const unite = uniteLabel(calc.unite, itemsById);

  if (item.prixVente == null && calc.valeur === 0) {
    return (
      <p style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED }}>
        Renseigne un prix de vente sur le contenant et sur ses résultats pour obtenir le
        verdict « vendre ou ouvrir ».
      </p>
    );
  }

  const meta = v ? VERDICTS[v.verdict] : null;
  const couleur = meta?.color || MUTED;

  return (
    <div style={{
      ...panel, padding: 0, overflow: 'hidden',
      border: `1px solid rgba(${hexToRgb(couleur)},0.4)`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px',
        background: `rgba(${hexToRgb(couleur)},0.08)`,
      }}>
        <span style={{ fontSize: 22 }}>{meta?.icon || '🤔'}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800, color: couleur,
          }}>
            {meta?.label || 'Verdict indisponible'}
          </div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(214,206,232,0.85)' }}>
            Ouvrir rapporte en moyenne <strong style={{ color: INK }}>{formatPrix(calc.valeur, calc.unite, itemsById)}</strong>
            {item.prixVente != null && <> · revente immédiate <strong style={{ color: INK }}>{formatPrix(item.prixVente, item.prixUnite, itemsById)}</strong></>}
            {v && <> · écart {v.ecart >= 0 ? '+' : ''}{Math.round(v.ecart * 100)} %</>}
          </div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED }}>
            {base === 'observee'
              ? `d'après les ${total} ouverture${total > 1 ? 's' : ''} relevée${total > 1 ? 's' : ''}`
              : "d'après les probabilités saisies dans la fiche"}
          </div>
        </div>
        <button type="button" onClick={() => setOuvert((o) => !o)} style={{
          background: 'transparent', border: `1px solid rgba(${ACC_RGB},0.35)`, borderRadius: 8,
          color: ACC, cursor: 'pointer', padding: '6px 11px', fontSize: 12,
          fontFamily: "'Inter',sans-serif", fontWeight: 600,
        }}>{ouvert ? 'Masquer le calcul' : 'Voir le calcul'}</button>
      </div>

      {calc.nonValorisePct > 0 && (
        <div style={{
          padding: '7px 14px', fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: GOLD, borderTop: '1px solid rgba(80,50,130,0.25)',
        }}>
          ⚠️ {pct(calc.nonValorisePct)} de la table n'est pas valorisée (résultat sans prix estimé,
          ou prix libellé dans une autre monnaie — aucune conversion n'est inventée). La vraie
          espérance est donc <em>au moins</em> celle affichée.
        </div>
      )}

      {ouvert && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(80,50,130,0.25)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: 'left' }}>
                <th style={th}>Résultat</th>
                <th style={{ ...th, textAlign: 'right' }}>{base === 'observee' ? 'Proba mesurée' : 'Proba'}</th>
                <th style={{ ...th, textAlign: 'right' }}>Qté moy.</th>
                <th style={{ ...th, textAlign: 'right' }}>Prix unit.</th>
                <th style={{ ...th, textAlign: 'right' }}>Apport</th>
              </tr>
            </thead>
            <tbody>
              {calc.lignes.map((x, i) => (
                <tr key={i} style={{ color: x.valorisee ? INK : MUTED }}>
                  <td style={td}>{x.ligne.label}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{pct(x.probabilite)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{Math.round(x.quantiteMoyenne * 100) / 100}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {x.valorisee ? Math.round(x.prixUnitaire * 100) / 100 : <em>inconnu</em>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>
                    {x.valorisee ? `+${Math.round(x.apport * 100) / 100}` : '—'}
                  </td>
                </tr>
              ))}
              <tr style={{ color: INK, fontWeight: 700, borderTop: '1px solid rgba(80,50,130,0.35)' }}>
                <td style={td} colSpan={4}>Espérance d'une ouverture</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>
                  {Math.round(calc.valeur * 100) / 100} {unite}
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ margin: '9px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            Apport = probabilité × quantité moyenne × prix unitaire. Le verdict tranche au-delà
            de ±10 % d'écart ; en deçà, les deux options se valent vu la précision des tables.
          </p>
        </div>
      )}
    </div>
  );
}

const th = { padding: '4px 6px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' };
const td = { padding: '4px 6px' };
