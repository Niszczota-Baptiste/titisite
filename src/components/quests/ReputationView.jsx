import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { INK, MUTED, OCCURRENCES, hexToRgb, panel } from './theme';

// Reference view: each faction's own tiers (name + threshold) as a graded bar.
// No current score — reputation lives in-game; this only documents the ladder
// and which quests grant reputation to the faction.
export function ReputationView({ onOpenQuest }) {
  const [factions, setFactions] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.quests.reputation().then(setFactions).catch((e) => setErr(e.message || 'Erreur'));
  }, []);

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;
  if (!factions) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;
  if (factions.length === 0) {
    return <p style={{ ...panel, padding: 24, textAlign: 'center', color: MUTED, fontFamily: "'Inter',sans-serif" }}>
      Aucune faction définie pour l'instant.
    </p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {factions.map((f) => <FactionCard key={f.id} f={f} onOpenQuest={onOpenQuest} />)}
    </div>
  );
}

function FactionCard({ f, onOpenQuest }) {
  const rgb = hexToRgb(f.couleur);
  const maxSeuil = Math.max(1, ...f.tiers.map((t) => t.seuil || 0));
  return (
    <div style={{ ...panel, padding: 16, borderTop: `3px solid ${f.couleur}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 800, color: INK }}>
          {f.nom}
        </h3>
        <span style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700,
          padding: '1px 7px', borderRadius: 999, color: f.couleur,
          background: `rgba(${rgb},0.14)`, border: `1px solid rgba(${rgb},0.4)`,
        }}>{f.type === 'maitrise' ? 'Maîtrise' : 'Faction'}</span>
      </div>
      {f.description && (
        <p style={{ margin: '0 0 12px', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
          {f.description}
        </p>
      )}

      {f.tiers.length === 0 ? (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED }}>Aucun palier défini.</p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
          {f.tiers.map((t) => (
            <li key={t.id} style={{ display: 'grid', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Inter',sans-serif", fontSize: 12.5 }}>
                <span style={{ color: INK, fontWeight: 600 }}>{t.nomPalier}</span>
                <span style={{ color: f.couleur, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{t.seuil}</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'rgba(80,50,130,0.2)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.round(((t.seuil || 0) / maxSeuil) * 100)}%`,
                  background: `linear-gradient(90deg, rgba(${rgb},0.5), ${f.couleur})`,
                }} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {f.grantingQuests.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, letterSpacing: '0.5px',
            textTransform: 'uppercase', color: MUTED, marginBottom: 6,
          }}>Quêtes qui en octroient</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {f.grantingQuests.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onOpenQuest?.(q.id)}
                style={{
                  cursor: 'pointer', padding: '3px 9px', borderRadius: 999,
                  background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.3)`,
                  color: INK, fontFamily: "'Inter',sans-serif", fontSize: 11.5,
                }}
              >
                {(OCCURRENCES[q.occurrenceType] || OCCURRENCES.simple).icon} {q.titre}
                {q.quantite != null && <span style={{ color: f.couleur, fontWeight: 700 }}> +{q.quantite}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
