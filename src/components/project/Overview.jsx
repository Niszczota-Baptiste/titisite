import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  ACC, ACC_RGB, ErrorBanner, Section, card, formatDate, muted,
} from './shared';

export function OverviewTab() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, features: [], meetings: [], builds: [], documents: [] });
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/features').catch(() => []),
      api.get('/meetings').catch(() => []),
      api.get('/builds').catch(() => []),
      api.get('/documents').catch(() => []),
    ])
      .then(([features, meetings, builds, documents]) => {
        setState({ loading: false, features, meetings, builds, documents });
      })
      .catch((e) => setErr(e.message));
  }, []);

  if (state.loading) return <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>;

  const now = Math.floor(Date.now() / 1000);
  const counts = {
    backlog: state.features.filter((f) => f.status === 'backlog').length,
    todo:    state.features.filter((f) => f.status === 'todo').length,
    doing:   state.features.filter((f) => f.status === 'doing').length,
    done:    state.features.filter((f) => f.status === 'done').length,
  };
  const upcoming = state.meetings
    .filter((m) => m.startsAt >= now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 3);
  const recentBuilds = state.builds.slice(0, 3);
  const recentDocs = state.documents.slice(0, 3);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const donePct = total ? Math.round((counts.done / total) * 100) : 0;

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.5px', marginBottom: 6,
        }}>
          Salut {user?.name || user?.email} 👋
        </h1>
        <p style={{ ...muted, fontSize: 14 }}>
          Voici un récap du projet.
        </p>
      </div>

      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {/* Kanban stats */}
      <Section title="Avancement">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12,
          marginBottom: 14,
        }}>
          {[
            ['Backlog', counts.backlog, 'rgba(180,170,200,0.55)'],
            ['À faire', counts.todo,    '#e8a87c'],
            ['En cours', counts.doing,  ACC],
            ['Terminé', counts.done,    '#9ad4ae'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{
                fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase',
                color: 'rgba(180,170,200,0.55)', fontWeight: 700,
                marginBottom: 6, fontFamily: "'Inter',sans-serif",
              }}>{label}</div>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
                color, lineHeight: 1,
              }}>{value}</div>
            </div>
          ))}
        </div>
        {total > 0 && (
          <div style={{ ...card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ ...muted, fontSize: 12 }}>Progression globale</span>
              <span style={{ color: ACC, fontSize: 12, fontWeight: 600 }}>{donePct} %</span>
            </div>
            <div style={{ height: 6, background: 'rgba(80,50,130,0.18)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${donePct}%`,
                background: `linear-gradient(90deg, #8a60b0, ${ACC})`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="Prochaines réunions" actions={<Link to="../meetings" style={miniLink}>Voir tout →</Link>}>
          {upcoming.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, padding: '12px 0' }}>Aucune réunion planifiée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map((m) => (
                <div key={m.id} style={{ ...card, padding: '10px 14px' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600, color: '#ede8f8' }}>
                    {m.title}
                  </div>
                  <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>{formatDate(m.startsAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Derniers builds" actions={<Link to="../builds" style={miniLink}>Voir tout →</Link>}>
          {recentBuilds.length === 0 ? (
            <p style={{ ...muted, fontSize: 12.5, padding: '12px 0' }}>Aucun build publié.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentBuilds.map((b) => (
                <div key={b.id} style={{ ...card, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 11, color: ACC,
                      background: `rgba(${ACC_RGB},0.1)`, padding: '1px 6px', borderRadius: 3,
                    }}>v{b.version}</span>
                    {b.title && (
                      <span style={{ fontSize: 13, color: '#ede8f8' }}>{b.title}</span>
                    )}
                  </div>
                  <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>
                    {b.status.toUpperCase()} · {formatDate(b.releasedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Derniers documents" actions={<Link to="../documents" style={miniLink}>Voir tout →</Link>}>
        {recentDocs.length === 0 ? (
          <p style={{ ...muted, fontSize: 12.5, padding: '12px 0' }}>Aucun document.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentDocs.map((d) => (
              <div key={d.id} style={{ ...card, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#ede8f8', fontWeight: 500 }}>{d.title}</div>
                  <div style={{ ...muted, fontSize: 11, marginTop: 2 }}>
                    par {d.uploadedByName || '—'} · {formatDate(d.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

const miniLink = {
  fontFamily: "'Inter',sans-serif", fontSize: 11,
  color: ACC, textDecoration: 'none',
  letterSpacing: '0.5px',
};
