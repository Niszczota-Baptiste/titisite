import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthor } from '../context';
import { CHAPTER_STATUSES, chapterStatus } from '../kinds';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import { Empty, ErrorLine, Pill, cx, relativeTime } from '../ui';

// Le livre dans son ordre, acte par acte : chapitres (statut, résumé, mots) et
// moments forts du plan. Lecture seule — l'ordre se décide dans l'atelier.

export function GuestChapters() {
  const { pid, P, version } = useAuthor();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [beats, setBeats] = useState(true);
  useShellPage({ crumbs: [{ label: 'Chapitres & plan' }], title: 'Chapitres' });

  useEffect(() => { P.plan.get().then(setPlan).catch(setError); }, [P, version]);

  const cols = useMemo(() => (plan
    ? [...plan.acts.map((a) => ({ key: a.id, act: a, items: a.items })), { key: 'none', act: null, items: plan.unassigned }]
    : []), [plan]);
  const chapters = cols.flatMap((c) => c.items.filter((i) => i.type === 'chapter'));
  const words = chapters.reduce((a, c) => a + (c.wordCount || 0), 0);
  const hasActs = cols.some((c) => c.act);

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div>
          <h1>📖 Chapitres &amp; plan</h1>
          <div className="au-sub">{chapters.length} chapitre{chapters.length > 1 ? 's' : ''} · {formatCount(words)} mots</div>
        </div>
      </div>
      <div className="au-chips-row">
        <button type="button" className={cx('au-chip', !filter && 'is-sel')} onClick={() => setFilter('')}>Tous</button>
        {CHAPTER_STATUSES.map((s) => (
          <button key={s.key} type="button" className={cx('au-chip', filter === s.key && 'is-sel')} onClick={() => setFilter(filter === s.key ? '' : s.key)}>
            <span className="au-dot" style={{ '--dot': s.color }} /> {s.label}
          </button>
        ))}
        <button type="button" className={cx('au-chip', beats && 'is-sel')} onClick={() => setBeats((b) => !b)} title="Afficher les moments forts du plan">⚡ Moments forts</button>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {plan && chapters.length === 0 && <Empty icon="📖" title="Pas encore de chapitre">Le plan du livre apparaîtra ici.</Empty>}
      {cols.map((col) => {
        const items = col.items.filter((i) => (i.type === 'chapter' ? !filter || i.status === filter : beats && !filter));
        if (items.length === 0) return null;
        return (
          <section key={col.key} className="au-chgroup">
            {(hasActs || col.act) && (
              <header className="au-chgroup-head">
                <span className="au-dot" style={{ '--dot': col.act?.color || 'var(--au-faint)' }} />
                <h2>{col.act ? col.act.title : 'Hors actes'}</h2>
                {col.act?.summary && <span className="au-faint au-desktop-only" style={{ fontSize: 12.5 }}>{col.act.summary}</span>}
              </header>
            )}
            <div className="au-chlist">
              {items.map((it) => (it.type === 'beat' ? (
                <div key={`b${it.id}`} className="au-beat-row" title={it.summary || undefined}>
                  ⚡ {it.title}{it.eventTitle ? <span className="au-faint"> · {it.eventTitle}</span> : null}
                </div>
              ) : (
                <Link key={`c${it.id}`} to={`/auteur/${pid}/e/${it.id}`} className="au-chrow">
                  <span className="au-chnum">{it.number}</span>
                  <span className="au-chmain">
                    <span className="au-row-title" style={{ display: 'block' }}>{it.title}</span>
                    <span className="au-row-meta" style={{ display: 'block' }}>{it.summary || <span className="au-faint">—</span>}</span>
                  </span>
                  <span className="au-chstats au-desktop-only">
                    <span>{formatCount(it.wordCount)} mots</span>
                    {it.contentUpdatedAt && <span className="au-faint" style={{ fontSize: 11 }}>{relativeTime(it.contentUpdatedAt)}</span>}
                  </span>
                  <Pill color={chapterStatus(it.status).color}>{chapterStatus(it.status).label}</Pill>
                </Link>
              )))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
