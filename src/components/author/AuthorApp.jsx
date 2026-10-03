import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './author.css';
import { Btn, ErrorLine, Field, PortalContext, formatDateTime } from './ui';
import { formatCount } from './text';

// Application de l'atelier d'auteur (chargée paresseusement par
// src/pages/Auteur.jsx une fois le droit vérifié). Routes relatives à /auteur.
//
// Un livre s'ouvre selon le niveau d'accès que le SERVEUR renvoie pour lui :
// propriétaire (atelier complet), omniscient (lecture de tout sauf la boîte à
// idées, commentaires) ou lecteur (chapitres terminés et validés). Chaque
// espace est un morceau chargé à part : un invité ne télécharge pas l'atelier.

const OwnerProject = lazy(() => import('./OwnerProject'));
const GuestProject = lazy(() => import('./guest/GuestProject'));
const ReaderProject = lazy(() => import('./reader/ReaderProject'));

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

function Loading({ children = 'Chargement…' }) {
  return <div className="au-page"><p className="au-muted">{children}</p></div>;
}

function ProjectRoot({ theme, setTheme }) {
  const { pid } = useParams();
  const id = Number(pid);
  const valid = Number.isInteger(id) && id > 0;
  const [state, setState] = useState({ id: null, access: null, error: null });

  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    setState({ id, access: null, error: null });
    api.author.p(id).get()
      .then((p) => { if (alive) setState({ id, access: p.access || 'owner', error: null }); })
      .catch((error) => { if (alive) setState({ id, access: null, error }); });
    return () => { alive = false; };
  }, [id, valid]);

  useEffect(() => { if (state.access) { try { localStorage.setItem(LAST_KEY, String(id)); } catch { /* ignore */ } } }, [id, state.access]);

  if (!valid) return <Navigate to="/auteur" replace />;
  // Projet introuvable, ou plus partagé : le serveur répond 404/403 dans tous
  // les cas → retour au choix du livre.
  if (state.error && [403, 404].includes(state.error.status)) {
    try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ }
    return <Navigate to="/auteur?choisir" replace />;
  }
  if (state.error) {
    return (
      <div className="au-page is-narrow">
        <ErrorLine error={state.error} />
        <Btn onClick={() => window.location.reload()}>Réessayer</Btn>
      </div>
    );
  }
  if (state.id !== id || !state.access) return <Loading />;
  const Space = state.access === 'owner' ? OwnerProject : state.access === 'omniscient' ? GuestProject : ReaderProject;
  return (
    <Suspense fallback={<Loading>Ouverture…</Loading>}>
      <Space key={id} pid={id} access={state.access} theme={theme} setTheme={setTheme} />
    </Suspense>
  );
}

const ROLE_LABEL = {
  omniscient: { icon: '👁️', label: 'Lecture complète + commentaires' },
  lecteur: { icon: '📖', label: 'Chapitres publiés' },
};

function ProjectPicker() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = !!user?.canAuthor;
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
      setShowForm(list.length === 0 && canCreate);
    }).catch(setError);
  }, [navigate, canCreate]);

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
          <h1 style={{ fontFamily: 'var(--au-head)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '6px 0' }}>
            {canCreate ? 'Atelier d\'auteur' : 'Livres partagés avec toi'}
          </h1>
          <p className="au-muted">
            {canCreate ? 'Le cerveau de ton livre : personnages, univers, chapitres, idées — tout relié.' : 'Choisis un livre à lire.'}
          </p>
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
                  {p.access === 'owner'
                    ? `${formatCount(p.words)} mots · ${p.entityCount} éléments · modifié le ${formatDateTime(p.updatedAt)}`
                    : `${ROLE_LABEL[p.access]?.icon || ''} ${ROLE_LABEL[p.access]?.label || ''}${p.ownerName ? ` · partagé par ${p.ownerName}` : ''}`}
                </div>
              </div>
            ))}
          </div>
        )}
        {projects?.length === 0 && !canCreate && (
          <p className="au-muted" style={{ textAlign: 'center' }}>Aucun livre ne t&apos;est partagé pour le moment.</p>
        )}
        {projects && canCreate && !showForm && <Btn onClick={() => setShowForm(true)} style={{ width: '100%' }}>＋ Nouveau livre</Btn>}
        {projects && canCreate && showForm && (
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
