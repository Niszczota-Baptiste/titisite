import {
  INK, JAUGE_MAX, LINE, MUTED, VERDICTS, ecartAuBudget, panel, pts, surJauge,
} from './theme';

// Le détail du calcul de puissance, ligne à ligne. C'est la pièce qui rend le
// score défendable : un admin qui trouve un item mal noté voit EXACTEMENT d'où
// viennent ses points, et va corriger le poids fautif dans l'onglet Barème
// plutôt que de discuter contre un nombre opaque.

const GENRES = {
  materiau: { label: 'Matériau', icon: '⛏' },
  attribut: { label: 'Attribut', icon: '📊' },
  enchant:  { label: 'Enchantement', icon: '✨' },
  reglage:  { label: 'Réglage', icon: '⚙️' },
};

/**
 * Jauge puissance / budget. L'échelle monte à 160 % du budget : le repère des
 * 100 % tombe donc aux deux tiers, et un item au double de son budget reste
 * visiblement au-delà au lieu de saturer comme un item pile dedans.
 *
 * La zone tolérée n'est pas dessinée à ± 25 % en dur : elle est lue sur
 * `puissance.tolerance`, le réglage du barème. Sinon un admin qui resserre la
 * tolérance verrait le verdict changer sans que la bande bouge.
 */
export function PowerGauge({ puissance, compact = false, libelle = 'pourcent' }) {
  const v = VERDICTS[puissance?.verdict] || VERDICTS.inconnu;
  const indice = puissance?.indice;
  const budget = puissance?.budget;
  const tol = puissance?.tolerance ?? 0.25;
  // Une fiche vide n'a rien à équilibrer : sa jauge s'efface plutôt que
  // d'annoncer un déficit qui n'existe pas.
  const eteinte = puissance?.verdict === 'incomplet' || indice == null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{
        flex: 1, minWidth: compact ? 48 : 90, height: compact ? 5 : 7,
        borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
        position: 'relative', opacity: eteinte ? 0.45 : 1,
      }}>
        {budget ? (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: surJauge(1 - tol), width: `${(2 * tol / JAUGE_MAX) * 100}%`,
            background: `${VERDICTS.ok.color}22`,
          }} />
        ) : null}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: surJauge(indice ?? 0), borderRadius: 4,
          background: `linear-gradient(90deg, ${v.color}88, ${v.color})`,
        }} />
        {/* Repère des 100 % — sans lui, « plein » et « pile dans le budget »
            seraient indiscernables. */}
        {budget ? (
          <div style={{
            position: 'absolute', left: surJauge(1), top: 0, bottom: 0,
            width: 2, marginLeft: -1, background: 'rgba(255,255,255,0.55)',
          }} />
        ) : null}
      </div>
      {libelle === 'aucun' ? null : (
        <span style={{ color: v.color, fontSize: compact ? 11 : 12, whiteSpace: 'nowrap' }}>
          {/* Un pourcentage n'a pas de sens sur une fiche sans aucune stat : il
              se lirait comme un déséquilibre alors qu'il n'y a rien à équilibrer. */}
          {v.icon} {indice != null && puissance.verdict !== 'incomplet'
            ? `${Math.round(indice * 100)} %` : v.court}
        </span>
      )}
    </div>
  );
}

/**
 * L'écart au budget, chiffré et signé. La jauge dit « à peu près où », ce
 * nombre dit « de combien » — c'est lui qu'on cite pour discuter un item.
 */
export function Ecart({ puissance, size = 11 }) {
  const e = ecartAuBudget(puissance);
  if (e == null || puissance?.verdict === 'incomplet') return null;
  const v = VERDICTS[puissance.verdict] || VERDICTS.inconnu;
  return (
    <span title={`${pts(puissance.total)} pts pour un budget de ${pts(puissance.budget)}`}
      style={{ color: v.color, fontSize: size, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {e > 0 ? '+' : ''}{e} %
    </span>
  );
}

export function PowerBreakdown({ puissance, tiers = [], onSuggest = null }) {
  if (!puissance) return null;
  const v = VERDICTS[puissance.verdict] || VERDICTS.inconnu;
  const suggere = puissance.tierSuggere;
  const tierNom = tiers.find((t) => t.id === suggere?.id)?.nom || suggere?.nom;

  return (
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: INK, fontFamily: "'Space Grotesk',sans-serif" }}>
          {pts(puissance.total)}
        </span>
        <span style={{ color: MUTED, fontSize: 12 }}>points de puissance</span>
        <Ecart puissance={puissance} size={12} />
        <span style={{ flex: 1 }} />
        <span style={{ color: v.color, fontSize: 12 }}>{v.icon} {v.label}</span>
      </div>

      {puissance.budget ? (
        <div style={{ marginTop: 10 }}>
          <PowerGauge puissance={puissance} />
          <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 11.5, lineHeight: 1.5 }}>
            Budget du palier : <strong style={{ color: INK }}>{pts(puissance.budget)} pts</strong>.
            La rareté ne multiplie pas la puissance — elle fixe ce qu'un item de ce palier
            est censé coûter. Tolérance ± {Math.round((puissance.tolerance ?? 0) * 100)} %.
          </p>
        </div>
      ) : (
        <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 11.5 }}>
          Aucun budget : renseigne un tier (et son budget dans le Référentiel) pour situer cet item.
        </p>
      )}

      {suggere && puissance.verdict !== 'ok' && puissance.verdict !== 'incomplet' ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>
          À cette puissance, le palier le plus proche serait{' '}
          <strong style={{ color: INK }}>{tierNom}</strong> ({pts(suggere.budget)} pts).
          {onSuggest ? (
            <button type="button" onClick={() => onSuggest(suggere.id)} style={{
              marginLeft: 8, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${LINE}`, background: 'rgba(255,255,255,0.04)',
              color: INK, fontSize: 11.5, fontFamily: "'Inter',sans-serif",
            }}>Appliquer</button>
          ) : null}
        </p>
      ) : null}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 12.5 }}>
        <tbody>
          {puissance.lignes.map((l, i) => (
            <tr key={`${l.label}-${i}`} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ padding: '6px 8px 6px 0', color: MUTED, width: 22 }}>
                {GENRES[l.genre]?.icon || '·'}
              </td>
              <td style={{ padding: '6px 8px 6px 0', color: INK }}>{l.label}</td>
              <td style={{
                padding: '6px 8px 6px 0', color: MUTED, fontFamily: 'ui-monospace, monospace',
                fontSize: 11.5, textAlign: 'right', whiteSpace: 'nowrap',
              }}>{l.detail}</td>
              <td style={{
                padding: '6px 0', textAlign: 'right', width: 62, whiteSpace: 'nowrap',
                color: l.points < 0 ? VERDICTS.sur.color : INK, fontWeight: 600,
              }}>{l.points > 0 ? '+' : ''}{pts(l.points)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: `2px solid ${LINE}` }}>
            <td />
            <td style={{ padding: '8px 8px 0 0', color: INK, fontWeight: 700 }}>Total</td>
            <td />
            <td style={{ padding: '8px 0 0', textAlign: 'right', color: INK, fontWeight: 700 }}>
              {pts(puissance.total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
