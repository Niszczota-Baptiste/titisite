import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { GOLD, INK, MUTED, OCCURRENCES, hexToRgb, panel } from './theme';

// "Si tu fais tout" — potential gains per cadence. Pure documentation of the
// ceiling (sum of reward lines); no score is ever stored.
const CARDS = [
  { key: 'journaliere',  suffix: '/ jour' },
  { key: 'hebdomadaire', suffix: '/ semaine' },
  { key: 'mensuelle',    suffix: '/ mois' },
  { key: 'simple',       suffix: '(uniques)' },
];

export function GainsView() {
  const [gains, setGains] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.quests.gains().then(setGains).catch((e) => setErr(e.message || 'Erreur'));
  }, []);

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;
  if (!gains) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;

  return (
    <div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: MUTED, margin: '0 0 16px', lineHeight: 1.55 }}>
        Ce que tu récoltes <strong style={{ color: INK }}>si tu complètes toutes</strong> les quêtes d'une
        cadence. Total documentaire — le site ne suit pas ton score, qui reste in-game.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {CARDS.map(({ key, suffix }) => {
          const g = gains[key];
          const occ = OCCURRENCES[key];
          if (!g) return null;
          return (
            <div key={key} style={{ ...panel, padding: 16, borderTop: `3px solid ${occ.color}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{occ.icon}</span>
                <h3 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800, color: INK }}>
                  {occ.label}
                </h3>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
                  {g.questCount} quête{g.questCount > 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 800, color: GOLD }}>
                  {g.pa}
                </span>
                <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>PA</span>
                <span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>{suffix}</span>
              </div>

              {g.reputations.length === 0 ? (
                <p style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED }}>
                  Aucun gain de réputation.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5 }}>
                  {g.reputations.map((r) => (
                    <li key={r.factionId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: INK,
                    }}>
                      <span style={{ color: r.couleur || INK, fontWeight: 600 }}>{r.nom || 'Faction'}</span>
                      <span style={{
                        fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                        color: r.couleur || INK,
                        background: `rgba(${hexToRgb(r.couleur || '#c9a8e8')},0.12)`,
                        borderRadius: 6, padding: '1px 7px',
                      }}>+{r.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
