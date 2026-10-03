import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthor } from '../context';
import { CHAPTER_STATUSES, KINDS, chapterStatus, kindMeta } from '../kinds';
import { Markdown } from '../markdown';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import { ErrorLine, KindAvatar, ProgressBar, entityPath, relativeTime } from '../ui';

// Accueil d'un invité omniscient : où en est le livre, ce que l'auteur vient
// de faire, et par où entrer (chapitres, personnages, univers, commentaires).

export function GuestHome() {
  const { pid, P, project, version, resolve } = useAuthor();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useShellPage({ crumbs: [], title: project?.title });
  const base = `/auteur/${pid}`;

  useEffect(() => { P.overview().then(setData).catch(setError); }, [P, version]);

  if (!data) return <div className="au-page"><ErrorLine error={error} />{!error && <p className="au-muted">Chargement…</p>}</div>;
  const { chapters, counts } = data;
  const pct = Math.round(chapters.progress * 100);
  const stats = [
    { label: 'Chapitres', value: chapters.total, to: 'chapitres', icon: '📖', color: KINDS.chapter.color },
    { label: 'Personnages', value: counts.character, to: 'personnages', icon: '👤', color: KINDS.character.color },
    { label: 'Lieux', value: counts.place, to: 'lieux', icon: '📍', color: KINDS.place.color },
    { label: 'Lore', value: counts.lore, to: 'univers', icon: '📜', color: KINDS.lore.color },
    { label: 'Événements', value: counts.event, to: 'chronologie', icon: '⚡', color: KINDS.event.color },
    { label: 'Tableaux partagés', value: data.boards, to: 'tableaux', icon: '🧩', color: '#b79bff' },
    { label: 'Commentaires', value: data.comments.total, to: 'commentaires', icon: '💬', color: '#9ad4ae' },
  ];

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div style={{ minWidth: 0 }}>
          <h1>{project?.title}</h1>
          <div className="au-sub">
            {project?.subtitle ? `${project.subtitle} · ` : ''}un livre de {project?.ownerName || 'l\'auteur'} — tu le lis en omniscient
          </div>
        </div>
      </div>

      <div className="au-card au-guest-intro">
        <span aria-hidden style={{ fontSize: 22 }}>👁️</span>
        <span>
          Tu vois tout l&apos;atelier — fiches, chapitres en cours, plan, chronologie — <strong>en lecture seule</strong>.
          Laisse tes remarques, tes questions et ce que tu comprends de l&apos;histoire dans les <Link to={`${base}/commentaires`}>commentaires</Link> :
          sur une fiche, sur un passage précis d&apos;un chapitre (sélectionne-le), ou sur le livre entier.
        </span>
      </div>

      {project?.description && (
        <div className="au-card" style={{ marginBottom: 18 }}>
          <div className="au-card-title">📕 Le livre</div>
          <Markdown content={project.description} pid={pid} resolve={resolve} />
        </div>
      )}

      {data.lastChapter && (
        <Link to={entityPath(pid, data.lastChapter)} className="au-card is-link au-resume">
          <span className="au-resume-ico" aria-hidden>✍️</span>
          <span style={{ minWidth: 0 }}>
            <span className="au-faint au-mini-label">En cours d&apos;écriture</span>
            <span className="au-row-title" style={{ display: 'block', fontSize: 16 }}>
              {data.lastChapter.number ? `Chapitre ${data.lastChapter.number} — ` : ''}{data.lastChapter.title}
            </span>
            <span className="au-row-meta">
              {chapterStatus(data.lastChapter.status).label} · {formatCount(data.lastChapter.wordCount)} mots · écrit {relativeTime(data.lastChapter.updatedAt)}
            </span>
          </span>
          <span className="au-btn is-small" style={{ marginLeft: 'auto' }}>Lire →</span>
        </Link>
      )}

      <div className="au-card" style={{ marginBottom: 18 }}>
        <div className="au-progress-head">
          <div>
            <div className="au-faint au-mini-label">Avancement</div>
            <div className="au-big-num">{pct}<small>%</small></div>
          </div>
          <div>
            <div className="au-faint au-mini-label">Mots écrits</div>
            <div className="au-big-num">{formatCount(chapters.words)}{chapters.targetWords ? <small> / {formatCount(chapters.targetWords)}</small> : null}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <ProgressBar value={chapters.progress} title={`Progression pondérée par statut : ${pct} %`} />
            <div className="au-status-strip" aria-label="Chapitres par statut">
              {CHAPTER_STATUSES.map((s) => (chapters.byStatus[s.key]
                ? <span key={s.key} style={{ flex: chapters.byStatus[s.key], background: s.color }} title={`${s.label} : ${chapters.byStatus[s.key]}`} />
                : null))}
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
          </Link>
        ))}
      </div>

      <div className="au-card">
        <div className="au-card-title">✏️ Ce que l&apos;auteur a touché récemment</div>
        {data.recentUpdated.length === 0 && <p className="au-muted" style={{ fontSize: 13 }}>Rien pour l&apos;instant.</p>}
        {data.recentUpdated.map((e) => (
          <Link key={e.id} to={entityPath(pid, e)} className="au-row">
            <KindAvatar entity={e} />
            <span className="au-row-main">
              <span className="au-row-title" style={{ display: 'block' }}>{e.number ? `${e.number}. ` : ''}{e.title}</span>
              <span className="au-row-meta" style={{ display: 'block' }}>{kindMeta(e.kind).label} · {relativeTime(e.updatedAt)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
