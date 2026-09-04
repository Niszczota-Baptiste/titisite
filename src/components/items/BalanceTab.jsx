import { useMemo, useState } from 'react';
import { Ecart, PowerGauge } from './PowerBreakdown';
import {
  ACC, ACC_RGB, INK, JAUGE_MAX, LINE, MUTED, VERDICTS, VERDICT_ORDRE, btn, panel, pts, surJauge,
} from './theme';

// L'onglet Équilibrage : le catalogue relu comme un tableau de bord.
//
// Le tri par défaut n'est pas la puissance mais l'ÉCART au budget du palier.
// Un artefact à 300 points n'est pas un problème ; un « Commun » à 100 en est
// un, et il se noierait au milieu d'un classement par puissance brute.
//
// Le bandeau et le tableau des paliers ne sont pas décoratifs : ce sont les
// COMMANDES du classement du bas. Lire « 7 trop forts » puis devoir aller les
// chercher à la main serait un compte rendu, pas un outil.

const ORDRES = [
  ['ecart', 'Écart au budget'],
  ['puissance', 'Puissance'],
  ['nom', 'Nom'],
];

export function BalanceTab({ items, referentiel, onOpen, verdictF, setVerdictF, onVoirCatalogue }) {
  const [ordre, setOrdre] = useState('ecart');
  const [echelle, setEchelle] = useState('');
  const [tierF, setTierF] = useState('');
  const [masquerIncomplets, setMasquerIncomplets] = useState(true);

  const echelles = useMemo(
    () => [...new Set(referentiel.tiers.map((t) => t.echelle))],
    [referentiel.tiers],
  );

  const tierEchelle = useMemo(
    () => new Map(referentiel.tiers.map((t) => [t.id, t.echelle])),
    [referentiel.tiers],
  );

  const liste = useMemo(() => {
    let l = items;
    if (echelle) l = l.filter((i) => tierEchelle.get(i.tierId) === echelle);
    if (tierF) l = l.filter((i) => String(i.tierId) === String(tierF));
    if (verdictF) l = l.filter((i) => i.puissance.verdict === verdictF);
    // Le filtre par verdict est explicite : s'il demande les fiches à
    // compléter, les masquer par défaut annulerait la demande.
    if (masquerIncomplets && verdictF !== 'incomplet') {
      l = l.filter((i) => i.puissance.verdict !== 'incomplet');
    }
    const cle = {
      // Sans indice (pas de tier, pas de budget), l'item n'a pas d'écart à
      // classer : il part en fin de liste plutôt que de simuler un écart nul.
      ecart: (i) => (i.puissance.indice == null ? -1 : Math.abs(i.puissance.indice - 1)),
      puissance: (i) => i.puissance.total,
      nom: (i) => i.nom,
    }[ordre];
    return [...l].sort((x, y) => {
      const a = cle(x);
      const b = cle(y);
      if (typeof a === 'string') return a.localeCompare(b, 'fr');
      return b - a;
    });
  }, [items, ordre, echelle, tierF, verdictF, masquerIncomplets, tierEchelle]);

  // Synthèse par palier : moyenne observée face au budget déclaré. Un palier
  // dont toute la population est sous son budget dit que c'est le BUDGET qui
  // est mal réglé, pas les vingt items.
  const parTier = useMemo(() => referentiel.tiers.map((t) => {
    const dedans = items.filter((i) => i.tierId === t.id && i.puissance.verdict !== 'incomplet');
    const moyenne = dedans.length
      ? dedans.reduce((s, i) => s + i.puissance.total, 0) / dedans.length : null;
    return {
      ...t,
      n: dedans.length,
      incomplets: items.filter((i) => i.tierId === t.id && i.puissance.verdict === 'incomplet').length,
      moyenne,
      mini: dedans.length ? Math.min(...dedans.map((i) => i.puissance.total)) : null,
      maxi: dedans.length ? Math.max(...dedans.map((i) => i.puissance.total)) : null,
    };
  }).filter((t) => !echelle || t.echelle === echelle), [items, referentiel.tiers, echelle]);

  const compteur = useMemo(() => {
    const c = {};
    for (const i of items) c[i.puissance.verdict] = (c[i.puissance.verdict] || 0) + 1;
    return c;
  }, [items]);

  const tolerance = items.find((i) => i.puissance.tolerance != null)?.puissance.tolerance ?? 0.25;
  const tierChoisi = referentiel.tiers.find((t) => String(t.id) === String(tierF));

  return (
    <div>
      {/* Le bandeau de santé : quatre tuiles, quatre filtres. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {VERDICT_ORDRE.filter((k) => compteur[k]).map((k) => {
          const v = VERDICTS[k];
          const actif = verdictF === k;
          return (
            <button
              key={k} type="button" onClick={() => setVerdictF(actif ? '' : k)}
              title={actif ? 'Retirer ce filtre' : `Ne garder que « ${v.label} »`}
              style={{
                ...panel, padding: '10px 14px', flex: '1 1 130px', textAlign: 'left',
                cursor: 'pointer', borderTop: `2px solid ${actif ? v.color : `${v.color}55`}`,
                background: actif ? `${v.color}12` : panel.background,
                borderColor: actif ? `${v.color}66` : LINE,
                borderTopColor: actif ? v.color : `${v.color}55`,
              }}
            >
              <div style={{
                color: v.color, fontSize: 20, fontWeight: 700,
                fontFamily: "'Space Grotesk',sans-serif",
              }}>{compteur[k]}</div>
              <div style={{ color: actif ? INK : MUTED, fontSize: 11.5 }}>{v.icon} {v.label}</div>
            </button>
          );
        })}
      </div>

      <section style={{ ...panel, padding: 14, marginBottom: 14 }}>
        <h3 style={titreStyle}>Population de chaque palier</h3>
        <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 11.5, lineHeight: 1.5 }}>
          Si tout un palier tombe du même côté de son budget, c'est le budget qu'il faut
          corriger dans le Référentiel — pas les items un par un. Clique une ligne pour ne
          garder que ce palier dans le classement ci-dessous.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: 'left' }}>
                <th style={th}>Palier</th><th style={th}>Échelle</th>
                <th style={{ ...th, textAlign: 'right' }}>Items</th>
                <th style={{ ...th, textAlign: 'right' }}>Budget</th>
                <th style={{ ...th, textAlign: 'right' }}>Moyenne</th>
                <th style={{ ...th, textAlign: 'right' }}>Min–Max</th>
                <th style={{ ...th, width: 120 }}>Moy. ÷ budget</th>
              </tr>
            </thead>
            <tbody>
              {parTier.map((t) => {
                const indice = t.moyenne && t.budget ? t.moyenne / t.budget : null;
                const couleur = indice == null ? MUTED
                  : indice > 1 + tolerance ? VERDICTS.sur.color
                    : indice < 1 - tolerance ? VERDICTS.sous.color : VERDICTS.ok.color;
                const actif = String(tierF) === String(t.id);
                return (
                  <tr
                    key={t.id} onClick={() => setTierF(actif ? '' : t.id)}
                    title={actif ? 'Retirer ce filtre' : `Ne garder que « ${t.nom} »`}
                    style={{
                      borderTop: `1px solid ${LINE}`, cursor: 'pointer',
                      background: actif ? `rgba(${ACC_RGB},0.08)` : 'transparent',
                    }}
                  >
                    <td style={{ ...td, color: t.couleur }}>{t.nom}</td>
                    <td style={{ ...td, color: MUTED }}>{t.echelle}</td>
                    <td style={{ ...td, textAlign: 'right', color: INK }}>
                      {t.n}{t.incomplets ? <span style={{ color: MUTED }}> +{t.incomplets} à compléter</span> : null}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: INK }}>{pts(t.budget)}</td>
                    <td style={{ ...td, textAlign: 'right', color: couleur, fontWeight: 600 }}>
                      {t.moyenne == null ? '—' : pts(t.moyenne)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: MUTED }}>
                      {t.mini == null ? '—' : `${pts(t.mini)} – ${pts(t.maxi)}`}
                    </td>
                    <td style={td}>
                      <MiniJauge indice={indice} couleur={couleur} tolerance={tolerance} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: MUTED, fontSize: 11.5 }}>Trier par</span>
        {ORDRES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setOrdre(k)}
            style={{ ...btn(ordre === k), padding: '4px 10px', fontSize: 12 }}>{l}</button>
        ))}
        <span style={{ width: 10 }} />
        <button type="button" onClick={() => setEchelle('')} style={{ ...btn(!echelle), padding: '4px 10px', fontSize: 12 }}>
          Toutes échelles
        </button>
        {echelles.map((e) => (
          <button key={e} type="button" onClick={() => setEchelle(e)}
            style={{ ...btn(echelle === e), padding: '4px 10px', fontSize: 12 }}>{e}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={masquerIncomplets} onChange={(e) => setMasquerIncomplets(e.target.checked)} />
          Masquer les fiches à compléter
        </label>
      </div>

      {/* Ce qui filtre est dit, et se retire d'un clic — un tableau qui ne
          montre que la moitié de la base sans l'annoncer se lit de travers. */}
      {tierChoisi || verdictF ? (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: MUTED, fontSize: 11.5 }}>Filtré sur</span>
          {tierChoisi ? (
            <ChipFiltre couleur={tierChoisi.couleur} onRetirer={() => setTierF('')}>
              {tierChoisi.nom}
            </ChipFiltre>
          ) : null}
          {verdictF ? (
            <ChipFiltre couleur={VERDICTS[verdictF]?.color} onRetirer={() => setVerdictF('')}>
              {VERDICTS[verdictF]?.icon} {VERDICTS[verdictF]?.label}
            </ChipFiltre>
          ) : null}
          {verdictF && onVoirCatalogue ? (
            <button type="button" onClick={onVoirCatalogue}
              style={{ ...btn(), padding: '3px 9px', fontSize: 11.5, color: MUTED }}>
              📦 Voir au catalogue
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ ...panel, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead>
            <tr style={{ color: MUTED, textAlign: 'left' }}>
              <th style={th}>Item</th>
              {/* Deux séries conçoivent des pièces sous les mêmes noms : sans
                  cette colonne, deux lignes voisines seraient indiscernables
                  alors qu'elles décrivent deux objets différents. */}
              <th style={th}>Série</th><th style={th}>Palier</th>
              <th style={{ ...th, textAlign: 'right' }}>Puissance</th>
              <th style={{ ...th, textAlign: 'right' }}>Budget</th>
              <th style={{ ...th, width: 190 }}>Écart</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((i) => (
              <tr key={i.id} onClick={() => onOpen(i.id)} style={{ borderTop: `1px solid ${LINE}`, cursor: 'pointer' }}>
                <td style={{ ...td, color: INK }}>{i.nom}</td>
                <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>
                  {i.serieCode ? `${i.serieCode} — ${i.serieNom}` : '—'}
                </td>
                <td style={{ ...td, color: i.tierCouleur || MUTED }}>{i.tierNom || '—'}</td>
                <td style={{ ...td, textAlign: 'right', color: INK, fontWeight: 600 }}>{pts(i.puissance.total)}</td>
                <td style={{ ...td, textAlign: 'right', color: MUTED }}>{i.puissance.budget ? pts(i.puissance.budget) : '—'}</td>
                <td style={td}>
                  {/* La colonne s'appelle « Écart » : la jauge la situe, le
                      nombre la chiffre. Le pourcentage du budget en plus ne
                      dirait qu'une troisième fois la même chose. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <PowerGauge puissance={i.puissance} compact libelle="aucun" />
                    </span>
                    <Ecart puissance={i.puissance} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 ? (
          <p style={{ color: MUTED, fontSize: 12.5, textAlign: 'center', padding: 24 }}>
            Aucun item sous ces filtres.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * La moyenne d'un palier rapportée à son budget. Même échelle que les jauges
 * d'item (0 → 160 %), pour qu'un palier et ses pièces se comparent à l'œil.
 */
function MiniJauge({ indice, couleur, tolerance }) {
  if (indice == null) return <span style={{ color: MUTED, fontSize: 11 }}>—</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        position: 'relative', flex: 1, minWidth: 48, height: 6, borderRadius: 4,
        background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
      }}>
        <span style={{
          position: 'absolute', top: 0, bottom: 0, left: surJauge(1 - tolerance),
          width: `${(2 * tolerance / JAUGE_MAX) * 100}%`, background: `${VERDICTS.ok.color}22`,
        }} />
        <span style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: surJauge(indice),
          borderRadius: 4, background: `linear-gradient(90deg, ${couleur}88, ${couleur})`,
        }} />
        <span style={{
          position: 'absolute', left: surJauge(1), top: 0, bottom: 0, width: 2,
          marginLeft: -1, background: 'rgba(255,255,255,0.55)',
        }} />
      </span>
      <span style={{ color: couleur, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(indice * 100)} %
      </span>
    </span>
  );
}

function ChipFiltre({ children, couleur, onRetirer }) {
  return (
    <button type="button" onClick={onRetirer} title="Retirer ce filtre" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontFamily: "'Inter',sans-serif",
      border: `1px solid ${couleur ? `${couleur}66` : LINE}`,
      background: couleur ? `${couleur}14` : 'rgba(255,255,255,0.03)',
      color: couleur || MUTED,
    }}>{children} <span style={{ opacity: 0.7 }}>✕</span></button>
  );
}

const titreStyle = {
  margin: '0 0 6px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5,
  fontWeight: 600, color: ACC, letterSpacing: '0.05em', textTransform: 'uppercase',
};
const th = { padding: '6px 10px', fontWeight: 500, fontSize: 11 };
const td = { padding: '7px 10px' };
