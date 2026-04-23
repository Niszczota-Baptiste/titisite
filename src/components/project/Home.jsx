import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ACC, ACC_RGB, Button } from '../admin/ui';
import { HomeShell } from './ProjectLayout';
import {
  Tag, card, formatDate, muted,
} from './shared';

export function Home() {
  const { user, logout, isAdmin } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.workspaces.list().then(setWorkspaces).catch((e) => setErr(e.message || 'Erreur'));
    const from = Math.floor(Date.now() / 1000);
    const to = from + 60 * 60 * 24 * 30; // next 30 days
    api.events({ from, to }).then(setEvents).catch(() => setEvents([]));
  }, []);

  return (
    <HomeShell user={user} logout={logout} isAdmin={isAdmin}>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 32px 60px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
            color: '#ede8f8', letterSpacing: '-0.5px', marginBottom: 6,
          }}>
            Salut {user?.name?.split(' ')[0] || user?.email} 👋
          </h1>
          <p style={{ ...muted, fontSize: 14 }}>
            Tes projets et les prochaines échéances.
          </p>
        </div>

        {err && (
          <div style={{
            background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
            fontFamily: "'Inter',sans-serif", fontSize: 13,
          }}>{err}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          <ProjectsGrid workspaces={workspaces} isAdmin={isAdmin} />
          <UpcomingPanel events={events} />
        </div>
      </main>
    </HomeShell>
  );
}

function ProjectsGrid({ workspaces, isAdmin }) {
  if (workspaces === null) {
    return <section><p style={{ ...muted, fontSize: 13 }}>Chargement…</p></section>;
  }
  const active = workspaces.filter((w) => w.status !== 'archived');
  const archived = workspaces.filter((w) => w.status === 'archived');

  return (
    <section>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700,
          color: '#ede8f8',
        }}>Mes projets</h2>
        {isAdmin && (
          <Link to="/admin" style={{
            color: ACC, textDecoration: 'none', fontSize: 12,
            fontFamily: "'Inter',sans-serif",
          }}>
            Gérer les projets →
          </Link>
        )}
      </header>

      {active.length === 0 ? (
        <div style={{ ...card, padding: 28, textAlign: 'center' }}>
          <p style={{ ...muted, fontSize: 13, marginBottom: 10 }}>
            Tu n'as accès à aucun projet pour le moment.
          </p>
          {isAdmin && (
            <Link to="/admin" style={{
              color: ACC, textDecoration: 'none', fontSize: 13, fontWeight: 600,
            }}>
              → Créer un projet
            </Link>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12,
        }}>
          {active.map((w) => <ProjectCard key={w.id} w={w} />)}
        </div>
      )}

      {archived.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{
            cursor: 'pointer', ...muted, fontSize: 11,
            letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700,
          }}>
            Archivés ({archived.length})
          </summary>
          <div style={{
            marginTop: 10,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12,
            opacity: 0.6,
          }}>
            {archived.map((w) => <ProjectCard key={w.id} w={w} archived />)}
          </div>
        </details>
      )}
    </section>
  );
}

function ProjectCard({ w, archived }) {
  return (
    <Link
      to={`/project/${w.slug}/overview`}
      style={{
        textDecoration: 'none', color: 'inherit',
        ...card, padding: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        borderColor: archived ? 'rgba(60,40,100,0.15)' : 'rgba(80,50,130,0.24)',
        transition: 'all 0.18s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = w.color || ACC;
        e.currentTarget.style.boxShadow = `0 8px 24px rgba(${hexToRgb(w.color || '#c9a8e8')},0.12)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = archived ? 'rgba(60,40,100,0.15)' : 'rgba(80,50,130,0.24)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ height: 4, background: w.color }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 22, flexShrink: 0,
            filter: `drop-shadow(0 0 10px ${w.color}66)`,
          }}>{w.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600,
              color: '#ede8f8', letterSpacing: '-0.2px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{w.name}</div>
            <div style={{
              ...muted, fontSize: 10.5, fontFamily: 'monospace', marginTop: 2,
            }}>/{w.slug}</div>
          </div>
        </div>

        {w.description && (
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12.5,
            color: 'rgba(200,192,216,0.7)', lineHeight: 1.5, marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', minHeight: 36,
          }}>{w.description}</p>
        )}

        {(w.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {w.tags.slice(0, 4).map((t) => <Tag key={t} name={t} />)}
          </div>
        )}

        {(w.startDate || w.endDate) && (
          <div style={{ ...muted, fontSize: 11 }}>
            {w.startDate && formatDate(w.startDate, { withTime: false })}
            {w.startDate && w.endDate && ' → '}
            {w.endDate && formatDate(w.endDate, { withTime: false })}
          </div>
        )}
      </div>
    </Link>
  );
}

function UpcomingPanel({ events }) {
  const grouped = useMemo(() => {
    if (!events) return null;
    const out = {};
    for (const ev of events) {
      const k = new Date(ev.ts * 1000).toLocaleDateString('fr-FR', {
        weekday: 'long', day: '2-digit', month: 'short',
      });
      (out[k] ||= []).push(ev);
    }
    return out;
  }, [events]);

  return (
    <section>
      <h2 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700,
        color: '#ede8f8', marginBottom: 14,
      }}>
        À venir (30 jours)
      </h2>

      {events === null ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : events.length === 0 ? (
        <div style={{ ...card, padding: 20 }}>
          <p style={{ ...muted, fontSize: 12.5 }}>
            Rien de planifié. Crée une réunion ou pose une échéance sur une carte.
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 14 }}>
          {Object.entries(grouped).map(([day, evs]) => (
            <div key={day} style={{ marginBottom: 12 }}>
              <div style={{
                fontFamily: 'monospace', fontSize: 10.5,
                color: 'rgba(180,170,200,0.55)', letterSpacing: '1px',
                textTransform: 'uppercase', marginBottom: 6, fontWeight: 600,
              }}>{day}</div>
              {evs.map((ev) => <EventRow key={`${ev.kind}-${ev.id}`} ev={ev} />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EventRow({ ev }) {
  const isMeeting = ev.kind === 'meeting';
  const time = isMeeting
    ? new Date(ev.ts * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const destination = isMeeting
    ? `/project/${ev.workspaceSlug}/meetings`
    : `/project/${ev.workspaceSlug}/kanban`;

  return (
    <Link
      to={destination}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 6,
        textDecoration: 'none', color: 'inherit',
        fontFamily: "'Inter',sans-serif", fontSize: 12.5,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${ACC_RGB},0.05)`)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: ev.workspaceColor, flexShrink: 0,
      }} title={ev.workspaceName} />
      <span style={{ fontSize: 12, flexShrink: 0 }}>{ev.workspaceIcon}</span>
      <span style={{
        flex: 1, minWidth: 0, color: '#ede8f8',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {isMeeting ? '📅' : '📌'} {ev.title}
      </span>
      {time && (
        <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'rgba(180,170,200,0.55)' }}>
          {time}
        </span>
      )}
    </Link>
  );
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].join(',') : '201,168,232';
}
