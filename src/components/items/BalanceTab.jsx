import { useMemo, useState } from 'react';
import { PowerGauge } from './PowerBreakdown';
import {
  ACC, INK, LINE, MUTED, VERDICTS, btn, panel, pts,
} from './theme';

// L'onglet Équilibrage : le catalogue relu comme un tableau de bord.
//
// Le tri par défaut n'est pas la puissance mais l'ÉCART au budget du palier.
// Un artefact à 300 points n'est pas un problème ; un « Commun » à 100 en est
// un, et il se noierait au milieu d'un classement par puissance brute.

const ORDRES = [
  ['ecart', 'Écart au budget'],
  ['puissance', 'Puissance'],
  ['nom', 'Nom'],
];

export function BalanceTab({ items, referentiel, onOpen }) {
  const [ordre, setOrdre] = useState('ecart');
  const [echelle, setEchelle] = useState('');
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
    if (masquerIncomplets) l = l.filter((i) => i.puissance.verdict !== 'incomplet');
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
  }, [items, ordre, echelle, masquerIncomplets, tierEchelle]);

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

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {Object.entries(VERDICTS).filter(([k]) => compteur[k]).map(([k, v]) => (
          <div key={k} style={{ ...panel, padding: '10px 14px', flex: '1 1 130px' }}>
            <div style={{ color: v.color, fontSize: 20, fontWeight: 700 }}>{compteur[k]}</div>
            <div style={{ color: MUTED, fontSize: 11.5 }}>{v.icon} {v.label}</div>
          </div>
        ))}
      </div>

      <section style={{ ...panel, padding: 14, marginBottom: 14 }}>
        <h3 style={titreStyle}>Population de chaque palier</h3>
        <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 11.5, lineHeight: 1.5 }}>
          Si tout un palier tombe du même côté de son budget, c'est le budget qu'il faut
          corriger dans le Référentiel — pas les items un par un.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: 'left' }}>
                <th style={th}>Palier</th><th style={th}>Échelle</th>
                <th style={{ ...th, textAlign: 'right' }}>Items</th>
                <th style={{ ...th, textAlign: 'right' }}>Budget</th>
                <th style={{ ...th, textAlign: 'right' }}>Moyenne</th>
                <th style={{ ...th, textAlign: 'right' }}>Min–Max</th>
              </tr>
            </thead>
            <tbody>
              {parTier.map((t) => {
                const ecart = t.moyenne && t.budget ? t.moyenne / t.budget : null;
                const couleur = ecart == null ? MUTED
                  : ecart > 1.25 ? VERDICTS.sur.color : ecart < 0.75 ? VERDICTS.sous.color : VERDICTS.ok.color;
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${LINE}` }}>
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
              <th style={{ ...th, width: 170 }}>Écart</th>
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
                <td style={td}><PowerGauge puissance={i.puissance} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 ? (
          <p style={{ color: MUTED, fontSize: 12.5, textAlign: 'center', padding: 24 }}>Rien à afficher.</p>
        ) : null}
      </div>
    </div>
  );
}

const titreStyle = {
  margin: '0 0 6px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5,
  fontWeight: 600, color: ACC, letterSpacing: '0.05em', textTransform: 'uppercase',
};
const th = { padding: '6px 10px', fontWeight: 500, fontSize: 11 };
const td = { padding: '7px 10px' };
