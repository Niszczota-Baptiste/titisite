import { useMemo } from 'react';
import { categoryBreakdown, planTotals } from './capacity';
import { GOLD, INK, LEVELS, MUTED, body, mono, panel, title } from './theme';

// Tableau de bord capacité : par catégorie (slots requis / disponibles / delta,
// trié par delta croissant — le plus en tension d'abord) et totaux du plan.
// « Requis » vient exclusivement des réserves manuelles saisies sur les zones :
// le plan ne connaît aucun stock réel.

export function Dashboard({ doc, dims, categories, warnings }) {
  const totals = useMemo(() => planTotals(doc, dims), [doc, dims]);
  const rows = useMemo(() => categoryBreakdown(doc, categories), [doc, categories]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Stat label="Étages" value={totals.floors} />
        <Stat label="Zones" value={totals.zones} sub={totals.reservedZones ? `${totals.reservedZones} réservée(s)` : null} />
        <Stat label="Coffres sans fond" value={totals.chests} sub={`${totals.assignedChests} affectés · ${totals.freeChests} libres`} />
        <Stat label="Slots disponibles" value={totals.slots} accent sub="72 slots par coffre" />
        <Stat label="Items rangés" value={totals.distinctItems} sub={totals.needed ? `réserve ${totals.needed} slots` : 'types distincts'} />
        <Stat label="Espace réservé MàJ" value={`${totals.reservedVolumePct.toFixed(1)} %`} sub="du volume total" />
      </div>

      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(80,50,130,0.25)' }}>
          <h3 style={{ ...title, fontSize: 13 }}>Capacité par catégorie</h3>
        </div>
        {rows.length === 0 ? (
          <p style={{ ...body, fontSize: 12, color: MUTED, padding: 14, margin: 0 }}>
            Aucune zone : attribue des catégories aux zones pour voir la répartition.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', ...body, fontSize: 12 }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: 'left' }}>
                  {['Catégorie', 'Zones', 'Coffres', 'Affectés', 'Slots', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={{ borderTop: '1px solid rgba(80,50,130,0.18)' }}>
                    <td style={{ padding: '8px 12px', color: INK }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />
                        {r.name}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', ...mono, color: MUTED }}>{r.zones}</td>
                    <td style={{ padding: '8px 12px', ...mono, color: INK }}>{r.chests}</td>
                    <td style={{ padding: '8px 12px', ...mono, color: LEVELS[r.level].color }}>{r.assigned}</td>
                    <td style={{ padding: '8px 12px', ...mono, color: MUTED }}>{r.slots}</td>
                    <td style={{ padding: '8px 12px', width: 120 }}>
                      {/* Avancement du rangement de la catégorie. */}
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(120,100,170,0.2)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, r.chests > 0 ? (r.assigned / r.chests) * 100 : 0)}%`,
                          height: '100%', background: LEVELS[r.level].color,
                        }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...panel, ...body, fontSize: 12, color: MUTED }}>
        <strong style={{ color: INK }}>{warnings.length}</strong> vérification(s) en attente ·
        {' '}<strong style={{ color: GOLD }}>{totals.chests}</strong> coffres sans fond
        {' '}(<strong style={{ color: INK }}>{totals.slots}</strong> slots), dont
        {' '}<strong style={{ color: INK }}>{totals.freeChests}</strong> encore libres.
        {' '}Les zones réservées MàJ sont exclues de ces calculs.
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={panel}>
      <div style={{ ...body, fontSize: 10.5, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
      <div style={{ ...title, fontSize: 22, color: accent ? GOLD : INK, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ ...mono, fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
