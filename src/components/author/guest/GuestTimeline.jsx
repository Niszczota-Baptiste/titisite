import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthor } from '../context';
import { useShellPage } from '../Shell';
import { Empty, ErrorLine, entityPath } from '../ui';

// Chronologie en lecture : une colonne par ligne de temps, événements dans
// l'ordre chronologique (même rendu que la vue liste de l'atelier).

export function GuestTimeline() {
  const { pid, P, version, timelines } = useAuthor();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  useShellPage({ crumbs: [{ label: 'Chronologie' }], title: 'Chronologie' });

  useEffect(() => {
    P.entities.list({ kind: 'event', sort: 'date', limit: 1000 }).then((r) => setEvents(r.items)).catch(setError);
  }, [P, version]);

  const lanes = useMemo(() => [
    ...timelines.map((t) => ({ key: `t${t.id}`, id: t.id, name: t.name, color: t.color })),
    { key: 'none', id: null, name: 'Sans ligne de temps', color: '#8a80a0' },
  ], [timelines]);

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head">
        <div><h1>⏳ Chronologie</h1><div className="au-sub">{events ? `${events.length} événement${events.length > 1 ? 's' : ''}` : '…'}</div></div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {events?.length === 0 && <Empty icon="⏳" title="Aucun événement">La chronologie du monde apparaîtra ici.</Empty>}
      {events && lanes.map((lane) => {
        const list = events.filter((e) => (lane.id === null ? !e.timelineId : e.timelineId === lane.id));
        if (!list.length) return null;
        return (
          <section key={lane.key} className="au-tl-listlane" style={{ '--lane': lane.color }}>
            <h2><span className="au-dot" style={{ '--dot': lane.color }} /> {lane.name}</h2>
            <ol>
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={entityPath(pid, e)} className="au-row">
                    <span className="au-tl-list-date">{e.dateLabel || (e.sortKey ?? 'non daté')}</span>
                    <span className="au-row-main">
                      <span className="au-row-title" style={{ display: 'block' }}>{e.importance === 3 ? '★ ' : ''}{e.title}</span>
                      {e.summary && <span className="au-row-meta" style={{ display: 'block' }}>{e.summary}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
