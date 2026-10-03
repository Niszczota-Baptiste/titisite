import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthor } from './context';
import { GUEST_NAV, NAV } from './nav';
import { Palette } from './Palette';
import { QuickCapture } from './QuickCapture';
import { Btn, Dialog, Kbd, MOD, cx, relativeTime, useHotkey } from './ui';

// Coquille de l'atelier : barre latérale (ordinateur), barre d'onglets + bouton
// d'idée flottant (téléphone), fil d'Ariane, indicateur de sauvegarde, palette
// de commandes et raccourcis clavier. Les pages déclarent leur fil d'Ariane et
// leur mode d'affichage via useShellPage().

const ShellCtx = createContext(null);

export function useShellPage({ crumbs = [], full = false, title } = {}) {
  const ctx = useContext(ShellCtx);
  const key = JSON.stringify(crumbs) + full;
  useEffect(() => {
    ctx?.setPage({ crumbs, full });
    if (title) document.title = `${title} — Atelier d'auteur`;
  }, [key, title]); // eslint-disable-line
  return ctx;
}

export function useFocusMode() {
  return useContext(ShellCtx)?.focusState || [false, () => {}];
}


const SAVE_TEXT = {
  idle: 'Sauvegardé', saved: 'Sauvegardé', loading: 'Sauvegardé', dirty: 'Modifié…',
  saving: 'Sauvegarde en cours…', error: 'Erreur de sauvegarde', conflict: 'Conflit à résoudre',
};
const SAVE_COLOR = { dirty: 'var(--au-warn)', saving: 'var(--au-acc)', error: 'var(--au-danger)', conflict: 'var(--au-danger)' };

function SaveIndicator() {
  const { saveState } = useAuthor();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const s = saveState.status;
  const title = s === 'error'
    ? 'La sauvegarde a échoué : tes modifications sont gardées dans ce navigateur et renvoyées automatiquement.'
    : saveState.at ? `Dernière sauvegarde ${relativeTime(Math.floor(saveState.at / 1000))}` : 'Tout est enregistré.';
  return (
    <span className={cx('au-save', `is-${s}`)} title={title} role="status" aria-live="polite">
      <span className="au-dot" style={{ '--dot': SAVE_COLOR[s] || 'var(--au-ok)' }} />
      <span className="au-desktop-only">{SAVE_TEXT[s] || 'Sauvegardé'}</span>
    </span>
  );
}

const SHORTCUTS = [
  [`${MOD} K`, 'Palette de commandes / recherche'],
  ['/', 'Rechercher'],
  ['I', 'Capturer une idée'],
  ['G puis D · C · P · L · U · T · I · B · H · R', 'Aller à : tableau de bord, chapitres, personnages, lieux, univers, tâches, idées, tableaux, chronologie, graphe'],
  ['[', 'Replier la barre latérale'],
  [`${MOD} S`, 'Sauvegarder maintenant (éditeur)'],
  [`${MOD} ⇧ F`, 'Mode focus (éditeur)'],
  ['?', 'Cette aide'],
];

const GUEST_SHORTCUTS = [
  [`${MOD} K`, 'Palette / recherche'],
  ['/', 'Rechercher'],
  ['G puis D · C · P · L · U · B · H · R', 'Aller à : vue d\'ensemble, chapitres, personnages, lieux, univers, tableaux, chronologie, graphe'],
  ['[', 'Replier la barre latérale'],
  ['?', 'Cette aide'],
];

const GOTO = { d: '', c: 'chapitres', p: 'personnages', l: 'lieux', u: 'univers', t: 'taches', i: 'idees', b: 'tableaux', h: 'chronologie', r: 'graphe', s: 'recherche', o: 'coherence' };

const isPalette = (e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
const isSlash = (e) => e.key === '/' && !e.ctrlKey && !e.metaKey;
const isIdea = (e) => e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey;
const isHelp = (e) => e.key === '?';
const isBracket = (e) => e.key === '[' && !e.ctrlKey && !e.metaKey;
const isG = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z]$/i.test(e.key);

export function Shell({ theme, setTheme, children }) {
  const { pid, project, counts, guest, paletteOpen, setPaletteOpen, captureOpen, setCaptureOpen } = useAuthor();
  const nav = guest ? GUEST_NAV : NAV;
  const [page, setPage] = useState({ crumbs: [], full: false });
  const focusState = useState(false);
  const [focus] = focusState;
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('au-sidebar') === '1'; } catch { return false; } });
  const [help, setHelp] = useState(false);
  const [more, setMore] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/auteur/${pid}`;
  const gPending = useRef(0);

  useEffect(() => { setMore(false); }, [location.pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => { try { localStorage.setItem('au-sidebar', c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  }, []);

  useHotkey(isPalette, (e) => { e.preventDefault(); setPaletteOpen(true); }, { inFields: true });
  useHotkey(isSlash, (e) => { e.preventDefault(); setPaletteOpen(true); });
  useHotkey(isHelp, () => setHelp(true));
  useHotkey(isBracket, toggleCollapsed);
  useHotkey(isG, (e) => {
    const k = e.key.toLowerCase();
    if (Date.now() - gPending.current < 1200 && GOTO[k] !== undefined) {
      gPending.current = 0;
      navigate(GOTO[k] ? `${base}/${GOTO[k]}` : base);
      return;
    }
    if (k === 'g') { gPending.current = Date.now(); return; }
    if (isIdea(e) && !guest) { e.preventDefault(); setCaptureOpen(true); }
  });

  const shell = useMemo(() => ({ setPage, focusState }), [focusState]);
  const crumbs = [{ label: project?.title || '…', to: base }, ...page.crumbs];

  const navItem = (it) => {
    const n = it.count ? counts?.[it.count] : null;
    return (
      <NavLink key={it.to} to={it.to ? `${base}/${it.to}` : base} end={it.end}
        className={({ isActive }) => cx('au-nav-item', isActive && 'is-active')} title={it.label}>
        <span className="au-nav-ico" aria-hidden>{it.icon}</span>
        <span className="au-nav-text">{it.label}</span>
        {n ? <span className="au-count" title={it.countHint ? `${n} ${it.countHint}` : undefined}>{n}</span> : null}
      </NavLink>
    );
  };

  return (
    <ShellCtx.Provider value={shell}>
      <div className={cx('au-app', collapsed && 'is-collapsed', focus && 'is-focus')}>
        <aside className="au-sidebar" aria-label="Navigation de l'atelier">
          <Link to={base} className="au-brand">
            <span className="au-brand-mark" aria-hidden>{guest ? '👁️' : '✒️'}</span>
            <span className="au-brand-text">
              {guest ? 'Lecture partagée' : 'Atelier d\'auteur'}
              <small>{project?.title}{guest && project?.ownerName ? ` · ${project.ownerName}` : ''}</small>
            </span>
          </Link>
          <button type="button" className="au-nav-item" onClick={() => setPaletteOpen(true)} title={`Rechercher (${MOD} K)`}>
            <span className="au-nav-ico" aria-hidden>⌕</span>
            <span className="au-nav-text">Rechercher…</span>
            <span className="au-count"><Kbd>{MOD} K</Kbd></span>
          </button>
          {!guest && (
            <button type="button" className="au-nav-item" onClick={() => setCaptureOpen(true)} title="Capturer une idée (I)">
              <span className="au-nav-ico" aria-hidden>＋</span>
              <span className="au-nav-text">Capturer une idée</span>
              <span className="au-count"><Kbd>I</Kbd></span>
            </button>
          )}
          {nav.map((g, i) => (
            <div key={i}>
              {g.label && <div className="au-nav-label">{g.label}</div>}
              {g.items.map(navItem)}
            </div>
          ))}
          <div className="au-sidebar-foot">
            {!guest && navItem({ to: 'reglages', label: 'Réglages & export', icon: '⚙️', count: 'trash', countHint: 'à la corbeille' })}
            <button type="button" className="au-nav-item" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Thème clair / sombre">
              <span className="au-nav-ico" aria-hidden>{theme === 'light' ? '🌙' : '☀️'}</span>
              <span className="au-nav-text">{theme === 'light' ? 'Thème sombre' : 'Thème clair'}</span>
            </button>
            <button type="button" className="au-nav-item" onClick={toggleCollapsed} title="Replier / déplier ([)">
              <span className="au-nav-ico" aria-hidden>{collapsed ? '»' : '«'}</span>
              <span className="au-nav-text">Replier</span>
            </button>
            {guest ? (
              <Link to="/auteur?choisir" className="au-nav-item" title="Livres partagés avec toi">
                <span className="au-nav-ico" aria-hidden>↩</span>
                <span className="au-nav-text">Mes livres partagés</span>
              </Link>
            ) : (
              <Link to="/admin" className="au-nav-item" title="Retour au tableau de bord admin">
                <span className="au-nav-ico" aria-hidden>↩</span>
                <span className="au-nav-text">Administration</span>
              </Link>
            )}
          </div>
        </aside>

        <div className="au-main">
          <header className="au-topbar">
            <nav className="au-crumbs" aria-label="Fil d'Ariane">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                // Sur téléphone, seul le dernier niveau et son parent s'affichent.
                const hideMobile = i < crumbs.length - 2;
                return (
                  <span key={i} className={hideMobile ? 'au-desktop-only' : undefined} style={{ display: 'contents' }}>
                    {i > 0 && <span className={cx('au-crumb-sep', i < crumbs.length - 1 && 'au-desktop-only')} aria-hidden>/</span>}
                    {last || !c.to
                      ? <span className={last ? 'au-crumb-cur' : undefined} aria-current={last ? 'page' : undefined}>{c.label}</span>
                      : <Link to={c.to}>{c.label}</Link>}
                  </span>
                );
              })}
            </nav>
            {guest ? <span className="au-pill au-readonly-pill" title="Tu lis ce livre : tu peux commenter, pas modifier.">👁️ Lecture seule</span> : <SaveIndicator />}
            {!guest && <Btn variant="ghost" size="small" className="au-desktop-only" onClick={() => setCaptureOpen(true)} title="Capturer une idée (I)">＋ Idée</Btn>}
            <Btn variant="ghost" size="small" onClick={() => setPaletteOpen(true)} title={`Rechercher (${MOD} K)`} aria-label="Rechercher">
              <span aria-hidden>⌕</span><span className="au-desktop-only">Rechercher</span><span className="au-desktop-only"><Kbd>{MOD} K</Kbd></span>
            </Btn>
            <Btn variant="ghost" size="small" icon className="au-desktop-only" onClick={() => setHelp(true)} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier">?</Btn>
          </header>
          <main className={cx('au-content', page.full && 'is-full')} id="au-content">
            {children}
          </main>
        </div>

        <nav className="au-tabbar" aria-label="Navigation principale">
          <NavLink to={base} end className={({ isActive }) => cx(isActive && 'is-active')}><span className="au-tab-ico" aria-hidden>🏠</span>Accueil</NavLink>
          {guest
            ? <NavLink to={`${base}/commentaires`} className={({ isActive }) => cx(isActive && 'is-active')}><span className="au-tab-ico" aria-hidden>💬</span>Avis</NavLink>
            : <NavLink to={`${base}/idees`} className={({ isActive }) => cx(isActive && 'is-active')}><span className="au-tab-ico" aria-hidden>💡</span>Idées</NavLink>}
          <NavLink to={`${base}/chapitres`} className={({ isActive }) => cx(isActive && 'is-active')}><span className="au-tab-ico" aria-hidden>📖</span>Livre</NavLink>
          <button type="button" onClick={() => setPaletteOpen(true)}><span className="au-tab-ico" aria-hidden>⌕</span>Chercher</button>
          <button type="button" onClick={() => setMore(true)} className={more ? 'is-active' : undefined}><span className="au-tab-ico" aria-hidden>☰</span>Plus</button>
        </nav>
        {!page.full && !guest && (
          <button type="button" className="au-fab" onClick={() => setCaptureOpen(true)} aria-label="Capturer une idée">＋</button>
        )}
      </div>

      <Dialog open={more} onClose={() => setMore(false)} title="Atelier d'auteur">
        <div className="au-sheet-grid">
          {nav.flatMap((g) => g.items).concat(guest ? [] : [{ to: 'reglages', label: 'Réglages', icon: '⚙️' }]).map((it) => (
            <Link key={it.to} to={it.to ? `${base}/${it.to}` : base}>
              <span className="au-tab-ico" aria-hidden>{it.icon}</span>{it.label}
              {it.count && counts?.[it.count] ? <span className="au-faint" style={{ fontSize: 11 }}>{counts[it.count]}</span> : null}
            </Link>
          ))}
          <button type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            <span className="au-tab-ico" aria-hidden>{theme === 'light' ? '🌙' : '☀️'}</span>Thème
          </button>
          {guest
            ? <Link to="/auteur?choisir"><span className="au-tab-ico" aria-hidden>↩</span>Mes livres</Link>
            : <Link to="/admin"><span className="au-tab-ico" aria-hidden>↩</span>Administration</Link>}
        </div>
      </Dialog>

      <Dialog open={help} onClose={() => setHelp(false)} title="Raccourcis clavier" width={520}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {(guest ? GUEST_SHORTCUTS : SHORTCUTS).map(([k, d]) => (
              <tr key={k} style={{ borderBottom: '1px solid var(--au-border)' }}>
                <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap' }}><Kbd>{k}</Kbd></td>
                <td style={{ padding: '7px 0', color: 'var(--au-muted)' }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="au-faint" style={{ fontSize: 12, marginTop: 12 }}>Clic droit (ou appui long sur téléphone) sur une carte pour ses actions.</p>
      </Dialog>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} theme={theme} setTheme={setTheme} />
      {!guest && <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />}
    </ShellCtx.Provider>
  );
}
