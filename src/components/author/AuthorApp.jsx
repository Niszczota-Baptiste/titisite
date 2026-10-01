import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import './author.css';
import { AuthorProvider, useAuthor } from './context';
import { Boards } from './pages/Boards';
import { Chapters } from './pages/Chapters';
import { Consistency } from './pages/Consistency';
import { Dashboard } from './pages/Dashboard';
import { EntityList } from './pages/EntityList';
import { EntityPage } from './pages/EntityPage';
import { Graph } from './pages/Graph';
import { Ideas } from './pages/Ideas';
import { Plan } from './pages/Plan';
import { SearchPage } from './pages/SearchPage';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';
import { Timeline } from './pages/Timeline';
import { Whiteboard } from './pages/Whiteboard';
import { Writer, WriterIndex } from './pages/Writer';
import { Shell } from './Shell';
import { Btn, ErrorLine, Field, PortalContext, formatDateTime } from './ui';
import { formatCount } from './text';

// Application de l'atelier d'auteur (chargée paresseusement par
// src/pages/Auteur.jsx une fois le droit vérifié). Routes relatives à /auteur.

const THEME_KEY = 'au-theme';
const LAST_KEY = 'au-last-project';

export default function AuthorApp() {
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; } });
  const [portal, setPortal] = useState(null);
  const setTheme = useCallback((t) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  }, []);

  return (
    <div className="au-root" data-theme={theme}>
      <PortalContext.Provider value={portal}>
        <Routes>
          <Route index element={<ProjectPicker />} />
          <Route path=":pid/*" element={<ProjectRoot theme={theme} setTheme={setTheme} />} />
        </Routes>
      </PortalContext.Provider>
      <div ref={setPortal} />
    </div>
  );
}

function ProjectRoot({ theme, setTheme }) {
  const { pid } = useParams();
  const id = Number(pid);
  useEffect(() => { try { localStorage.setItem(LAST_KEY, String(id)); } catch { /* ignore */ } }, [id]);
  if (!Number.isInteger(id) || id <= 0) return <Navigate to="/auteur" replace />;
  return (
    <AuthorProvider pid={id} key={id}>
      <ProjectGuard>
        <Shell theme={theme} setTheme={setTheme}>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="personnages" element={<EntityList kind="character" />} />
            <Route path="lieux" element={<EntityList kind="place" />} />
            <Route path="univers" element={<EntityList kind="lore" />} />
            <Route path="evenements" element={<EntityList kind="event" />} />
            <Route path="e/:id" element={<EntityPage />} />
            <Route path="idees" element={<Ideas />} />
            <Route path="chapitres" element={<Chapters />} />
            <Route path="plan" element={<Plan />} />
            <Route path="ecrire" element={<WriterIndex />} />
            <Route path="ecrire/:id" element={<Writer />} />
            <Route path="tableaux" element={<Boards />} />
            <Route path="tableaux/:boardId" element={<Whiteboard />} />
            <Route path="chronologie" element={<Timeline />} />
            <Route path="graphe" element={<Graph />} />
            <Route path="taches" element={<Tasks />} />
            <Route path="recherche" element={<SearchPage />} />
            <Route path="coherence" element={<Consistency />} />
            <Route path="reglages" element={<Settings />} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Routes>
        </Shell>
      </ProjectGuard>
    </AuthorProvider>
  );
}

// Projet introuvable (supprimé, ou pas à toi : le serveur répond 404 dans les
// deux cas) → retour au choix du livre.
function ProjectGuard({ children }) {
  const { loadError } = useAuthor();
  if (loadError?.status === 404) {
    try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
    return <Navigate to="/auteur" replace />;
  }
  if (loadError) {
    return (
      <div className="au-page is-narrow">
        <ErrorLine error={loadError} />
        <Btn onClick={() => window.location.reload()}>Réessayer</Btn>
      </div>
    );
  }
  return children;
}

function ProjectPicker() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ title: '', subtitle: '', targetWords: '' });
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.author.projects.list().then((list) => {
      let last = null;
      try { last = Number(localStorage.getItem(LAST_KEY)); } catch { /* ignore */ }
      if (new URLSearchParams(window.location.search).get('choisir') === null) {
        const target = list.find((p) => p.id === last) || (list.length === 1 ? list[0] : null);
        if (target) { navigate(`/auteur/${target.id}`, { replace: true }); return; }
      }
      setProjects(list);
      setShowForm(list.length === 0);
    }).catch(setError);
  }, [navigate]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const p = await api.author.projects.create({
        title: form.title.trim(), subtitle: form.subtitle.trim(),
        targetWords: form.targetWords ? Number(form.targetWords) : null,
      });
      navigate(`/auteur/${p.id}`);
    } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20,
      background: 'radial-gradient(900px 500px at 50% -10%, rgba(var(--au-acc-rgb),0.12), transparent 60%), var(--au-bg)' }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 40 }} aria-hidden>✒️</div>
          <h1 style={{ fontFamily: 'var(--au-head)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '6px 0' }}>Atelier d&apos;auteur</h1>
          <p className="au-muted">Le cerveau de ton livre : personnages, univers, chapitres, idées — tout relié.</p>
        </div>
        <ErrorLine error={error} onClose={() => setError(null)} />
        {projects === null && !error && <p className="au-muted" style={{ textAlign: 'center' }}>Chargement…</p>}
        {projects?.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            {projects.map((p) => (
              <div key={p.id} className="au-card is-link" role="link" tabIndex={0}
                onClick={() => navigate(`/auteur/${p.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/auteur/${p.id}`); }}>
                <div style={{ fontFamily: 'var(--au-head)', fontWeight: 700, fontSize: 17 }}>{p.title}</div>
                {p.subtitle && <div className="au-muted">{p.subtitle}</div>}
                <div className="au-faint" style={{ fontSize: 12, marginTop: 6 }}>
                  {formatCount(p.words)} mots · {p.entityCount} éléments · modifié le {formatDateTime(p.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
        {projects && !showForm && <Btn onClick={() => setShowForm(true)} style={{ width: '100%' }}>＋ Nouveau livre</Btn>}
        {projects && showForm && (
          <form className="au-card" onSubmit={create}>
            <div className="au-card-title">{projects.length ? 'Nouveau livre' : 'Commencer ton livre'}</div>
            <Field label="Titre (provisoire, ça se change)">
              <input className="au-input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Le Livre des Cendres" />
            </Field>
            <Field label="Sous-titre">
              <input className="au-input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Tome I" />
            </Field>
            <Field label="Objectif de mots (facultatif)">
              <input className="au-input" type="number" min="0" inputMode="numeric" value={form.targetWords} onChange={(e) => setForm({ ...form, targetWords: e.target.value })} placeholder="90000" />
            </Field>
            <Btn type="submit" variant="primary" disabled={busy || !form.title.trim()} style={{ width: '100%' }}>Créer et ouvrir</Btn>
          </form>
        )}
      </div>
    </div>
  );
}
