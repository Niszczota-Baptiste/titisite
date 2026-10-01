import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthor } from '../context';
import { CHAPTER_STATUSES, KINDS, chapterStatus, kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import { Btn, Empty, ErrorLine, KindAvatar, ProgressBar, entityPath, relativeTime } from '../ui';

// Vue d'ensemble : progression du livre, compteurs, et surtout de quoi
// reprendre immédiatement (dernier chapitre écrit, éléments récents, tâches).

export function Dashboard() {
  const { pid, P, project, version, setCaptureOpen, bump } = useAuthor();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  useShellPage({ crumbs: [], title: project?.title });
  const base = `/auteur/${pid}`;

  const load = useCallback(() => P.overview().then(setData).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const toggleTask = async (t) => {
    await P.tasks.update(t.id, { done: !t.done });
    bump();
  };

  if (!data) return <div className="au-page"><ErrorLine error={error} />{!error && <p className="au-muted">Chargement…</p>}</div>;
  const { chapters, counts } = data;
  const pct = Math.round(chapters.progress * 100);

  const stats = [
    { label: 'Chapitres', value: chapters.total, to: 'chapitres', icon: '📖', color: KINDS.chapter.color },
    { label: 'Personnages', value: counts.character, to: 'personnages', icon: '👤', color: KINDS.character.color },
    { label: 'Lieux', value: counts.place, to: 'lieux', icon: '📍', color: KINDS.place.color },
    { label: 'Lore', value: counts.lore, to: 'univers', icon: '📜', color: KINDS.lore.color },
    { label: 'Événements', value: counts.event, to: 'chronologie', icon: '⚡', color: KINDS.event.color },
    { label: 'Idées en attente', value: data.ideas.pending, to: 'idees', icon: '💡', color: KINDS.note.color, sub: data.ideas.inbox ? `${data.ideas.inbox} dans l'inbox` : null },
    { label: 'Relations', value: data.links, to: 'graphe', icon: '🕸️', color: '#b79bff' },
    { label: 'Tâches ouvertes', value: data.tasks.open, to: 'taches', icon: '✅', color: '#9ad4ae' },
    { label: 'Points de cohérence', value: data.issueCount ?? '—', to: 'coherence', icon: '🧭', color: data.issueCount ? '#e8a87c' : '#9ad4ae' },
  ];

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div style={{ minWidth: 0 }}>
          <h1>{project?.title}</h1>
          {project?.subtitle && <div className="au-sub">{project.subtitle}</div>}
        </div>
        <div className="au-actions">
          <Btn onClick={() => setCaptureOpen(true)}>💡 Idée</Btn>
          {data.lastChapter
            ? <Btn variant="primary" onClick={() => navigate(`${base}/ecrire/${data.lastChapter.id}`)}>✍️ Reprendre l&apos;écriture</Btn>
            : <Btn variant="primary" onClick={() => navigate(`${base}/chapitres`)}>✍️ Écrire</Btn>}
        </div>
      </div>

      {data.lastChapter && (
        <Link to={`${base}/ecrire/${data.lastChapter.id}`} className="au-card is-link au-resume">
          <span className="au-resume-ico" aria-hidden>✍️</span>
          <span style={{ minWidth: 0 }}>
            <span className="au-faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Là où tu t&apos;es arrêté</span>
            <span className="au-row-title" style={{ display: 'block', fontSize: 16 }}>
              {data.lastChapter.number ? `Chapitre ${data.lastChapter.number} — ` : ''}{data.lastChapter.title}
            </span>
            <span className="au-row-meta">
              {chapterStatus(data.lastChapter.status).label} · {formatCount(data.lastChapter.wordCount)} mots · écrit {relativeTime(data.lastChapter.updatedAt)}
            </span>
          </span>
          <span className="au-btn is-small" style={{ marginLeft: 'auto' }}>Continuer →</span>
        </Link>
      )}

      <div className="au-card" style={{ marginBottom: 18 }}>
        <div className="au-progress-head">
          <div>
            <div className="au-faint au-mini-label">Progression du livre</div>
            <div className="au-big-num">{pct}<small>%</small></div>
          </div>
          <div>
            <div className="au-faint au-mini-label">Mots écrits</div>
            <div className="au-big-num">{formatCount(chapters.words)}{chapters.targetWords ? <small> / {formatCount(chapters.targetWords)}</small> : null}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <ProgressBar value={chapters.progress} title={`Progression pondérée par statut : ${pct} %`} />
            {chapters.wordProgress !== null && (
              <div style={{ marginTop: 8 }}><ProgressBar value={chapters.wordProgress} color="#9ad4ae" title={`Objectif de mots : ${Math.round(chapters.wordProgress * 100)} %`} /></div>
            )}
            <div className="au-status-strip" aria-label="Chapitres par statut">
              {CHAPTER_STATUSES.map((s) => (chapters.byStatus[s.key] ? (
                <span key={s.key} style={{ flex: chapters.byStatus[s.key], background: s.color }} title={`${s.label} : ${chapters.byStatus[s.key]}`} />
              ) : null))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, marginTop: 6 }} className="au-muted">
              {CHAPTER_STATUSES.map((s) => (chapters.byStatus[s.key]
                ? <span key={s.key}><span className="au-dot" style={{ '--dot': s.color }} /> {s.label} {chapters.byStatus[s.key]}</span>
                : null))}
            </div>
          </div>
        </div>
      </div>

      <div className="au-stats">
        {stats.map((s) => (
          <Link key={s.label} to={`${base}/${s.to}`} className="au-stat" style={{ '--kc': s.color }}>
            <span className="au-stat-ico" aria-hidden>{s.icon}</span>
            <span className="au-stat-val">{s.value}</span>
            <span className="au-stat-label">{s.label}</span>
            {s.sub && <span className="au-stat-sub">{s.sub}</span>}
          </Link>
        ))}
      </div>

      {data.ideas.inbox > 0 && (
        <Link to={`${base}/idees?vue=inbox`} className="au-card is-link au-inbox-callout">
          📥 <strong>{data.ideas.inbox}</strong> idée{data.ideas.inbox > 1 ? 's' : ''} capturée{data.ideas.inbox > 1 ? 's' : ''} à classer
          <span style={{ marginLeft: 'auto' }}>Classer →</span>
        </Link>
      )}

      <div className="au-dash-grid">
        <div className="au-card">
          <div className="au-card-title">🕘 Reprendre</div>
          {data.recentOpened.length === 0
            ? <p className="au-muted" style={{ fontSize: 13 }}>Les éléments que tu ouvres apparaîtront ici.</p>
            : data.recentOpened.map((e) => <EntityRow key={e.id} pid={pid} e={e} meta={`ouvert ${relativeTime(e.lastOpenedAt)}`} />)}
        </div>
        <div className="au-card">
          <div className="au-card-title">✏️ Dernières modifications</div>
          {data.recentUpdated.length === 0
            ? <Empty icon="🌱" title="Ton univers est vide">Commence par un personnage, une idée ou un premier chapitre.</Empty>
            : data.recentUpdated.map((e) => <EntityRow key={e.id} pid={pid} e={e} meta={relativeTime(e.updatedAt)} />)}
        </div>
        <div className="au-card">
          <div className="au-card-title">✅ À faire <Link to={`${base}/taches`} className="au-btn is-ghost is-small" style={{ marginLeft: 'auto' }}>Tout voir</Link></div>
          {data.tasks.items.length === 0
            ? <p className="au-muted" style={{ fontSize: 13 }}>Aucune tâche en cours.</p>
            : data.tasks.items.map((t) => (
              <div key={t.id} className="au-row" style={{ cursor: 'default' }}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} aria-label={`Terminer : ${t.title}`} className="au-check" />
                <div className="au-row-main">
                  <div className="au-row-title" style={{ fontWeight: 500 }}>{t.title}</div>
                  {t.entity && <Link className="au-row-meta" to={entityPath(pid, t.entity)}>{kindMeta(t.entity.kind).icon} {t.entity.title}</Link>}
                </div>
                {t.dueDate && <span className="au-faint" style={{ fontSize: 11.5 }}>{new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
              </div>
            ))}
        </div>
        <div className="au-card">
          <div className="au-card-title">🔍 À approfondir</div>
          {data.toDevelop.length === 0 && data.thin.length === 0 && <p className="au-muted" style={{ fontSize: 13 }}>Rien en suspens. 👌</p>}
          {data.toDevelop.map((e) => <EntityRow key={e.id} pid={pid} e={e} meta="Idée à développer" />)}
          {data.thin.map((e) => <EntityRow key={e.id} pid={pid} e={e} meta="Fiche encore vide" />)}
        </div>
        {data.favorites.length > 0 && (
          <div className="au-card" style={{ gridColumn: '1 / -1' }}>
            <div className="au-card-title">⭐ Favoris</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.favorites.map((e) => (
                <Link key={e.id} to={entityPath(pid, e)} className="au-chip" style={{ padding: '5px 11px', fontSize: 12.5, color: 'var(--au-text)' }}>
                  {e.icon || kindMeta(e.kind).icon} {e.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EntityRow({ pid, e, meta }) {
  return (
    <Link to={entityPath(pid, e)} className="au-row">
      <KindAvatar entity={e} />
      <span className="au-row-main">
        <span className="au-row-title" style={{ display: 'block' }}>{e.number ? `${e.number}. ` : ''}{e.title}</span>
        <span className="au-row-meta" style={{ display: 'block' }}>{kindMeta(e.kind).label} · {meta}</span>
      </span>
    </Link>
  );
}
