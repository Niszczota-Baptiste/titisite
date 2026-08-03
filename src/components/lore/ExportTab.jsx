import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../../api/client';
import { formatCoords } from './coords';
import { LoreMarkdown } from './markdown';
import {
  ACC, ACC_RGB, ENTRY_TYPES, ENTRY_TYPE_ORDER, INK, MUTED, STANCES, STATUSES,
  formatDay, panel,
} from './theme';

// Onglet 📤 Export : le dump JSON complet (GET /api/lore/export, servi en
// attachment) et le dossier imprimable — une vue HTML propre qui compile
// entrées et hypothèses actives, rendue plein écran par la page.

export function ExportTab({ onOpenDossier }) {
  const [err, setErr] = useState(null);
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: "'Inter',sans-serif" }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 13 }}>{err}</p>}
      <div style={{ ...panel, padding: '16px 18px', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4 }}>
          📥 Export JSON complet
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 10px' }}>
          Tout le dossier : entrées (avec tags), hypothèses (avec preuves), relations,
          tracés, cartes, médias, commentaires et historique des révisions.
        </p>
        <button
          type="button"
          onClick={() => triggerDownload('/api/lore/export', 'lore-nostra-export.json').catch((e) => setErr(e.message))}
          style={{
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: ACC, color: '#08130b', border: 'none',
          }}
        >Télécharger lore-nostra-export.json</button>
      </div>
      <div style={{ ...panel, padding: '16px 18px' }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4 }}>
          🖨 Dossier imprimable
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 10px' }}>
          Une vue papier qui compile les hypothèses actives (avec leurs preuves) et
          toutes les entrées par type — les pistes fermées en annexe, avec leurs notes.
        </p>
        <button
          type="button" onClick={onOpenDossier}
          style={{
            padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: 'transparent', color: ACC, border: `1px solid rgba(${ACC_RGB},0.6)`,
          }}
        >Ouvrir le dossier</button>
      </div>
    </div>
  );
}

// ── Le dossier lui-même : fond papier, palette neutre, @media print ─────────

const LIVE = ['open', 'testing', 'confirmed'];
const DEAD = ['refuted', 'abandoned'];

export function DossierView({ onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.lore.export()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f0e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', color: '#5a5344' }}>
        {err || 'Compilation du dossier…'}
      </div>
    );
  }

  const active = data.hypotheses.filter((h) => LIVE.includes(h.status));
  const dead = data.hypotheses.filter((h) => DEAD.includes(h.status));
  const located = data.entries.filter((e) => e.x !== null && e.z !== null).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f0e6', color: '#221d14', fontFamily: 'Georgia, "Times New Roman", serif' }}>
      {/* styles d'impression : la barre d'outils disparaît, marges papier */}
      <style>{'@media print { .no-print { display: none !important; } body { background: #fff; } }'}</style>

      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 10, alignItems: 'center',
        padding: '10px 22px', background: 'rgba(34,29,20,0.95)', color: '#f4f0e6',
        fontFamily: "'Inter',sans-serif", fontSize: 13,
      }}>
        <button type="button" onClick={onBack} style={{
          padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          background: 'transparent', color: '#f4f0e6', border: '1px solid rgba(244,240,230,0.5)',
        }}>← Retour à l'enquête</button>
        <button type="button" onClick={() => window.print()} style={{
          padding: '7px 15px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          background: '#f4f0e6', color: '#221d14', border: 'none',
        }}>🖨 Imprimer</button>
        <span style={{ marginLeft: 'auto', opacity: 0.7 }}>Le dossier s'imprime tel quel — la barre disparaît.</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '36px 24px 80px' }}>
        <header style={{ borderBottom: '3px double #221d14', paddingBottom: 14, marginBottom: 26 }}>
          <div style={{ fontSize: 12, letterSpacing: '3px', textTransform: 'uppercase', color: '#7a7057' }}>
            Nostra · Minefield — dossier d'enquête
          </div>
          <h1 style={{ margin: '4px 0 6px', fontSize: 30, fontWeight: 700 }}>Le lore de Nostra</h1>
          <div style={{ fontSize: 13, color: '#5a5344' }}>
            Compilé le {formatDay(data.exportedAt)} — {data.entries.length} entrées ({located} géolocalisées),{' '}
            {data.hypotheses.length} hypothèses dont {dead.length} pistes fermées, {data.links.length} relations.
          </div>
        </header>

        <h2 style={h2Style}>Hypothèses actives</h2>
        {active.length === 0 && <p style={{ color: '#5a5344' }}>Aucune hypothèse active.</p>}
        {active.map((h) => <DossierHypothesis key={h.id} h={h} entries={data.entries} />)}

        <h2 style={h2Style}>Entrées du dossier</h2>
        {ENTRY_TYPE_ORDER.map((type) => {
          const list = data.entries.filter((e) => e.entryType === type);
          if (list.length === 0) return null;
          return (
            <section key={type} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, borderBottom: '1px solid rgba(34,29,20,0.3)', paddingBottom: 3 }}>
                {ENTRY_TYPES[type].icon} {ENTRY_TYPES[type].label}s ({list.length})
              </h3>
              {list.map((e) => (
                <div key={e.id} style={{ margin: '12px 0 16px', breakInside: 'avoid' }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {e.title}
                    {!e.isCanon && <span style={{ fontWeight: 400, fontSize: 11.5, color: '#7a7057' }}> — interprétation</span>}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#5a5344', margin: '1px 0 4px' }}>
                    {e.x !== null && e.z !== null ? formatCoords(e) : 'non localisée'}
                    {e.dimension !== 'overworld' ? ` · ${e.dimension}` : ''}
                    {e.discoveredAt ? ` · découverte ${formatDay(e.discoveredAt)}` : ''}
                    {e.tags.length ? ` · ${e.tags.map((t) => t.name).join(', ')}` : ''}
                  </div>
                  {e.bodyMd && <LoreMarkdown content={e.bodyMd} entries={data.entries} print />}
                </div>
              ))}
            </section>
          );
        })}

        {dead.length > 0 && (
          <>
            <h2 style={h2Style}>Annexe — pistes fermées</h2>
            <p style={{ fontSize: 12.5, color: '#5a5344', fontStyle: 'italic' }}>
              Réfutées ou abandonnées, gardées au dossier : savoir pourquoi une piste est morte
              vaut autant qu'une découverte.
            </p>
            {dead.map((h) => <DossierHypothesis key={h.id} h={h} entries={data.entries} />)}
          </>
        )}
      </div>
    </div>
  );
}

function DossierHypothesis({ h, entries }) {
  const meta = STATUSES[h.status] || STATUSES.open;
  return (
    <div style={{ margin: '14px 0 20px', breakInside: 'avoid' }}>
      <div style={{ fontWeight: 700, fontSize: 15.5 }}>
        {meta.icon} {h.title}
        <span style={{ fontWeight: 400, fontSize: 12, color: '#5a5344' }}> — {meta.label}, confiance {h.confidence} %</span>
      </div>
      {h.bodyMd && <LoreMarkdown content={h.bodyMd} entries={entries} print style={{ margin: '4px 0' }} />}
      {h.resolutionNote && (
        <div style={{ fontSize: 13, margin: '4px 0', padding: '6px 10px', background: 'rgba(34,29,20,0.06)', borderLeft: '3px solid rgba(34,29,20,0.4)' }}>
          <strong>Résolution{h.resolvedAt ? ` (${formatDay(h.resolvedAt)})` : ''} :</strong> {h.resolutionNote}
        </div>
      )}
      {h.evidence.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 22, fontSize: 13 }}>
          {h.evidence.map((ev) => (
            <li key={ev.id} style={{ marginBottom: 2 }}>
              <strong>{(STANCES[ev.stance] || STANCES.neutral).icon} {(STANCES[ev.stance] || STANCES.neutral).label}</strong>
              {' — '}{ev.entry.title}{ev.note ? ` (${ev.note})` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const h2Style = {
  fontSize: 21, fontWeight: 700, margin: '30px 0 10px',
  borderBottom: '2px solid #221d14', paddingBottom: 4,
};
