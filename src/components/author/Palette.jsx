import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { KINDS, KIND_ORDER, kindMeta } from './kinds';
import { NAV } from './nav';
import { Highlight, KindAvatar, Kbd, PortalContext, cx, entityPath, normalizeQuery } from './ui';

// Palette de commandes (Ctrl/⌘ K) : recherche plein-texte dans tout l'univers,
// navigation, création rapide. Sans saisie : les éléments récents.

export function Palette({ open, onClose, theme, setTheme }) {
  const portal = useContext(PortalContext);
  if (!open || !portal) return null;
  return createPortal(<PaletteInner onClose={onClose} theme={theme} setTheme={setTheme} />, portal);
}

function PaletteInner({ onClose, theme, setTheme }) {
  const { pid, P, search, createEntity, setCaptureOpen } = useAuthor();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(null);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const base = `/auteur/${pid}`;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      search(q, kind ? [kind] : undefined).then((r) => { if (alive) { setResults(r); setActive(0); } }).catch(() => {});
    }, q ? 120 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, kind, search]);

  const go = useCallback((to) => { onClose(); navigate(to); }, [navigate, onClose]);

  const commands = useMemo(() => {
    const nq = normalizeQuery(q);
    const list = [];
    const text = q.trim();
    if (text) {
      list.push({ id: 'capture', icon: '💡', label: `Capturer l'idée « ${text} »`, run: async () => {
        await P.notes.quick(text);
        toast.success('Idée capturée dans l\'inbox');
        onClose();
      } });
      for (const k of KIND_ORDER) {
        list.push({ id: `new-${k}`, icon: KINDS[k].icon, label: `Créer « ${text} » — ${KINDS[k].label.toLowerCase()}`, run: async () => {
          const e = await createEntity(k, { title: text, ...(k === 'note' ? { inbox: false } : {}) });
          go(k === 'chapter' ? `${base}/e/${e.id}` : entityPath(pid, e));
        } });
      }
    }
    const nav = NAV.flatMap((g) => g.items).concat([{ to: 'reglages', label: 'Réglages & export', icon: '⚙️' }])
      .map((it) => ({ id: `go-${it.to}`, icon: it.icon, label: `Aller à : ${it.label}`, run: () => go(it.to ? `${base}/${it.to}` : base) }));
    const misc = [
      { id: 'capture-open', icon: '＋', label: 'Capturer une idée…', run: () => { onClose(); setCaptureOpen(true); } },
      { id: 'theme', icon: theme === 'light' ? '🌙' : '☀️', label: theme === 'light' ? 'Passer en thème sombre' : 'Passer en thème clair', run: () => { setTheme(theme === 'light' ? 'dark' : 'light'); onClose(); } },
    ];
    const filtered = [...misc, ...nav].filter((c) => !nq || normalizeQuery(c.label).includes(nq));
    return [...list.slice(0, text ? 1 : 0), ...filtered, ...list.slice(1)];
  }, [q, P, toast, onClose, createEntity, go, base, pid, theme, setTheme, setCaptureOpen]);

  const rows = useMemo(() => [
    ...results.map((r) => ({ type: 'entity', key: `e${r.id}`, entity: r })),
    ...commands.map((c) => ({ type: 'cmd', key: c.id, cmd: c })),
  ], [results, commands]);

  const run = useCallback((row, { alt = false } = {}) => {
    if (!row) return;
    if (row.type === 'entity') {
      const e = row.entity;
      go(alt && e.kind === 'chapter' ? `${base}/ecrire/${e.id}` : entityPath(pid, e));
    } else {
      Promise.resolve(row.cmd.run()).catch((err) => toast.error(err.message));
    }
  }, [go, base, pid, toast]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(rows[active], { alt: e.ctrlKey || e.metaKey }); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const order = [null, ...KIND_ORDER];
      setKind((k) => order[(order.indexOf(k) + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
    }
  };

  let idx = -1;
  const entityRows = rows.filter((r) => r.type === 'entity');
  const cmdRows = rows.filter((r) => r.type === 'cmd');
  const renderRow = (row) => {
    idx += 1;
    const i = idx;
    return (
      <div key={row.key} data-row={i} role="option" aria-selected={i === active}
        className={cx('au-palette-item', i === active && 'is-active')}
        onMouseMove={() => setActive(i)} onClick={() => run(row)}>
        {row.type === 'entity' ? (
          <>
            <KindAvatar entity={row.entity} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="au-row-title">{row.entity.number ? `${row.entity.number}. ` : ''}{row.entity.title}</div>
              <div className="au-row-meta">
                {kindMeta(row.entity.kind).label}
                {row.entity.snippet ? <> — <Highlight text={row.entity.snippet} /></> : null}
              </div>
            </div>
            {row.entity.kind === 'chapter' && i === active && <span className="au-faint au-desktop-only" style={{ fontSize: 11 }}><Kbd>{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'} ↵</Kbd> écrire</span>}
          </>
        ) : (
          <>
            <span className="au-avatar" aria-hidden>{row.cmd.icon}</span>
            <div className="au-row-title" style={{ fontWeight: 500 }}>{row.cmd.label}</div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="au-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="au-palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <div className="au-palette-input">
          <span aria-hidden style={{ fontSize: 18, color: 'var(--au-muted)' }}>⌕</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={kind ? `Chercher dans : ${KINDS[kind].plural}…` : 'Chercher un personnage, un lieu, un chapitre, une idée… ou une commande'}
            aria-label="Recherche" role="combobox" aria-expanded="true" />
          {kind && <button type="button" className="au-chip" onClick={() => setKind(null)}>{KINDS[kind].icon} {KINDS[kind].plural} ×</button>}
          <button type="button" className="au-btn is-ghost is-small au-mobile-only" onClick={onClose}>Fermer</button>
        </div>
        <div className="au-palette-list" ref={listRef} role="listbox">
          {entityRows.length > 0 && <div className="au-palette-group">{q ? 'Résultats' : 'Récents'}</div>}
          {entityRows.map(renderRow)}
          {cmdRows.length > 0 && <div className="au-palette-group">Commandes</div>}
          {cmdRows.map(renderRow)}
          {rows.length === 0 && <div className="au-faint" style={{ padding: 16 }}>Aucun résultat.</div>}
        </div>
        <div className="au-palette-foot au-desktop-only">
          <span><Kbd>↑↓</Kbd> naviguer</span><span><Kbd>↵</Kbd> ouvrir</span><span><Kbd>Tab</Kbd> filtrer par type</span><span><Kbd>Échap</Kbd> fermer</span>
        </div>
      </div>
    </div>
  );
}
