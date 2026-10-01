import {
  createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { KINDS, kindMeta } from './kinds';

// Primitives de l'atelier d'auteur. Les dialogues et menus sont « portés »
// DANS la racine .au-root (et non dans <body>) pour hériter des variables du
// thème clair/sombre.

export const PortalContext = createContext(null);

function Portal({ children }) {
  const el = useContext(PortalContext);
  if (!el) return null;
  return createPortal(children, el);
}

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Btn({ variant, size, icon, on, className, children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('au-btn', variant && `is-${variant}`, size && `is-${size}`, icon && 'is-icon', on && 'is-on', className)}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }) {
  return <kbd className="au-kbd">{children}</kbd>;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

export function Empty({ icon = '✦', title, children, action }) {
  return (
    <div className="au-empty">
      <div className="au-empty-ico" aria-hidden>{icon}</div>
      {title && <div style={{ fontWeight: 700, color: 'var(--au-text)', marginBottom: 4 }}>{title}</div>}
      {children && <div style={{ fontSize: 13 }}>{children}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorLine({ error, onClose }) {
  if (!error) return null;
  return (
    <div className="au-error" role="alert">
      <span style={{ flex: 1 }}>{humanError(error)}</span>
      {onClose && <button type="button" onClick={onClose} className="au-btn is-ghost is-small is-icon" aria-label="Fermer">×</button>}
    </div>
  );
}

const ERRORS = {
  network_error: 'Connexion impossible — vérifie le réseau.',
  forbidden: 'Accès refusé.',
  not_found: 'Introuvable (supprimé ou déplacé ?).',
  rate_limited: 'Trop de requêtes, réessaie dans un instant.',
  required: 'Champ obligatoire manquant.',
  too_long: 'Texte trop long.',
  invalid_color: 'Couleur invalide.',
  invalid_date: 'Date invalide.',
  invalid_number: 'Nombre invalide.',
  self_link: 'Un élément ne peut pas être relié à lui-même.',
  tag_exists: 'Ce tag existe déjà.',
  category_exists: 'Cette catégorie existe déjà.',
  not_an_image: 'Ce fichier n\'est pas une image lisible.',
  mime_not_allowed: 'Format refusé (JPEG, PNG ou WebP).',
  extension_not_allowed: 'Format refusé (JPEG, PNG ou WebP).',
  file_too_large: 'Image trop lourde (15 Mo max).',
  confirmation_mismatch: 'Le titre retapé ne correspond pas.',
};
export function humanError(err) {
  if (!err) return '';
  const code = typeof err === 'string' ? err : err.message;
  return ERRORS[code] || code || 'Erreur inattendue.';
}

export function Pill({ color, children, title }) {
  return <span className="au-pill" style={color ? { '--pill': color } : undefined} title={title}>{children}</span>;
}

export function Dot({ color }) {
  return <span className="au-dot" style={{ '--dot': color }} />;
}

export function TagChip({ tag, onRemove, onClick }) {
  return (
    <span className="au-chip is-tag" style={{ '--chip': tag.color || 'var(--au-acc)', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      #{tag.name}
      {onRemove && <button type="button" aria-label={`Retirer ${tag.name}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
    </span>
  );
}

export function ProgressBar({ value, color, title }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className="au-progress" title={title} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function KindAvatar({ entity, size }) {
  const meta = kindMeta(entity?.kind);
  const src = entity?.coverUrl || entity?.cover?.thumbUrl;
  return (
    <span className={cx('au-avatar', size === 'lg' && 'is-lg')} style={{ '--kc': entity?.color || meta.color }} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : (entity?.icon || meta.icon)}
    </span>
  );
}

// Rend un extrait de recherche : le serveur balise les correspondances par
// \u0002…\u0003 (jamais de HTML) → éléments <mark>.
export function Highlight({ text }) {
  const parts = String(text || '').split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('\u0002')
        ? <mark key={i} className="au-hl">{p.slice(1, -1)}</mark>
        : <Fragment key={i}>{p.replace(/[\u0002\u0003]/g, '')}</Fragment>))}
    </>
  );
}

export function entityPath(pid, entity) {
  if (!entity) return `/auteur/${pid}`;
  return `/auteur/${pid}/e/${entity.id}`;
}

export function EntityLink({ pid, entity, children, className }) {
  const meta = kindMeta(entity.kind);
  return (
    <Link to={entityPath(pid, entity)} className={className} title={`${meta.label} — ${entity.title}`}>
      {children ?? (
        <>
          <span aria-hidden>{entity.icon || meta.icon}</span>{' '}
          {entity.number ? `${entity.number}. ` : ''}{entity.title}
        </>
      )}
    </Link>
  );
}

// Zone de texte qui grandit avec son contenu (fiches, idées). `big` = titre.
export function AutoText({ value, onChange, placeholder, rows = 1, big, className, onKeyDown, autoFocus, style, ...rest }) {
  const ref = useRef(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);
  useLayoutEffect(fit, [value, fit]);
  // La largeur change (panneau replié, rotation, police chargée) → on remesure.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(); } });
    ro.observe(el);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [fit]);
  return (
    <textarea
      ref={ref}
      value={value ?? ''}
      rows={1}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={cx('au-inline', big && 'is-big', className)}
      style={rows > 1 ? { minHeight: `calc(${rows} * 1.6em + 14px)`, ...style } : style}
      {...rest}
    />
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <div className={cx('au-field', className)}>
      {label && <div className="au-field-label">{label}</div>}
      {children}
      {hint && <div className="au-field-hint">{hint}</div>}
    </div>
  );
}

// Section repliable ; l'état replié est mémorisé par clé (localStorage).
export function Section({ id, title, children, actions, defaultOpen = true }) {
  const key = id ? `au-section:${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!key) return defaultOpen;
    try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === '1'; } catch { return defaultOpen; }
  });
  const toggle = () => {
    setOpen((o) => {
      try { if (key) localStorage.setItem(key, o ? '0' : '1'); } catch { /* ignore */ }
      return !o;
    });
  };
  return (
    <section className={cx('au-section', !open && 'is-closed')}>
      <div className="au-section-head" onClick={toggle} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}>
        <span className="au-chev" aria-hidden>▼</span>
        <span>{title}</span>
        {actions && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </div>
      <div className="au-section-body">{children}</div>
    </section>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="au-tabs" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k}
          className={cx('au-tab', value === k && 'is-active')} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

// ── Dialogue ───────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, footer, width = 560, initialFocus = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    if (initialFocus) {
      const t = setTimeout(() => {
        const el = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('input, textarea, select');
        el?.focus?.();
      }, 20);
      return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
    }
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [open, onClose, initialFocus]);
  if (!open) return null;
  return (
    <Portal>
      <div className="au-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div ref={ref} className="au-dialog" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ '--w': `${width}px` }}>
          <div className="au-dialog-head">
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            <Btn variant="ghost" size="small" icon onClick={onClose} aria-label="Fermer">✕</Btn>
          </div>
          <div className="au-dialog-body">{children}</div>
          {footer && <div className="au-dialog-foot">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// Petit formulaire « une valeur » (renommer, nouvel acte…).
export function PromptDialog({ open, title, label, initial = '', placeholder, confirmLabel = 'Valider', onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);
  const submit = (e) => { e?.preventDefault(); if (value.trim()) onSubmit(value.trim()); };
  return (
    <Dialog open={open} onClose={onClose} title={title} width={440}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={submit} disabled={!value.trim()}>{confirmLabel}</Btn></>}>
      <form onSubmit={submit}>
        <Field label={label}>
          <input className="au-input" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} data-autofocus autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

// ── Menu contextuel ────────────────────────────────────────────────────────
// useMenu() → [openMenu(event|rect, items), element]. Clic droit sur
// ordinateur, appui long ou bouton « ⋯ » sur téléphone ; feuille d'actions en
// bas d'écran sous 900 px (CSS).

export function useMenu() {
  const [state, setState] = useState(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((e, items) => {
    let x; let y;
    if (e && typeof e.clientX === 'number' && (e.clientX || e.clientY)) { x = e.clientX; y = e.clientY; }
    else if (e?.currentTarget?.getBoundingClientRect) { const r = e.currentTarget.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
    else { x = window.innerWidth / 2; y = window.innerHeight / 2; }
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setState({ x, y, items: items.filter(Boolean) });
  }, []);
  const element = state ? <MenuPopup state={state} onClose={close} /> : null;
  return [open, element, close];
}

function MenuPopup({ state, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });
  const [active, setActive] = useState(-1);
  const actionable = state.items.filter((i) => !i.sep);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(state.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - r.height - 8)),
    });
    el.focus();
  }, [state]);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % actionable.length); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + actionable.length) % actionable.length); }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); actionable[active]?.onClick?.(); onClose(); }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, actionable, active]);
  let n = -1;
  return (
    <Portal>
      <div ref={ref} className="au-menu" role="menu" tabIndex={-1} style={pos}>
        {state.items.map((it, i) => {
          if (it.sep) return <div key={`s${i}`} className="au-menu-sep" />;
          n += 1;
          const idx = n;
          return (
            <button key={it.label} type="button" role="menuitem"
              className={cx('au-menu-item', it.danger && 'is-danger', idx === active && 'is-active')}
              onMouseEnter={() => setActive(idx)}
              onClick={() => { onClose(); it.onClick?.(); }}>
              <span style={{ width: 18, textAlign: 'center' }} aria-hidden>{it.icon}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.hint && <span className="au-faint" style={{ fontSize: 11 }}>{it.hint}</span>}
            </button>
          );
        })}
      </div>
    </Portal>
  );
}

// Appui long (tactile) → même action que le clic droit.
export function useLongPress(callback, ms = 480) {
  const timer = useRef(null);
  const start = useRef(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return;
      start.current = { x: e.clientX, y: e.clientY };
      const target = e.currentTarget;
      const { clientX, clientY } = e;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (navigator.vibrate) navigator.vibrate(12);
        callback({ clientX, clientY, currentTarget: target, preventDefault() {}, stopPropagation() {} });
      }, ms);
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => { e.preventDefault(); callback(e); },
  };
}

// ── Choix d'un élément (relations, tâches, tableau…) ──────────────────────

export function EntityPicker({ search, kinds, exclude = [], onPick, onCreate, placeholder = 'Rechercher un élément…', autoFocus = true }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  // Clés texte : les tableaux passés en props changent d'identité à chaque
  // rendu, ils ne doivent pas relancer la recherche.
  const kindsKey = (kinds || []).join(',');
  const exKey = exclude.join(',');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ex = new Set(exKey ? exKey.split(',').map(Number) : []);
    const t = setTimeout(() => {
      search(q, kindsKey ? kindsKey.split(',') : undefined).then((r) => {
        if (!alive) return;
        setItems(r.filter((x) => !ex.has(x.id)).slice(0, 30));
        setActive(0);
      }).catch(() => { if (alive) setItems([]); }).finally(() => { if (alive) setLoading(false); });
    }, q ? 160 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, kindsKey, exKey, search]);

  const createKinds = onCreate && q.trim() ? (kinds && kinds.length ? kinds : ['character', 'place', 'lore', 'event', 'chapter', 'note']) : [];
  const total = items.length + createKinds.length;
  const choose = (i) => {
    if (i < items.length) onPick(items[i]);
    else if (createKinds[i - items.length]) onCreate(createKinds[i - items.length], q.trim());
  };

  return (
    <div>
      <input className="au-input" value={q} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter') { e.preventDefault(); if (total) choose(active); }
        }} />
      <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
        {items.map((it, i) => (
          <div key={it.id} className={cx('au-palette-item', i === active && 'is-active')} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
            <KindAvatar entity={it} />
            <div style={{ minWidth: 0 }}>
              <div className="au-row-title">{it.number ? `${it.number}. ` : ''}{it.title}</div>
              <div className="au-row-meta">{kindMeta(it.kind).label}{it.snippet ? ' — ' : ''}<Highlight text={it.snippet} /></div>
            </div>
          </div>
        ))}
        {createKinds.map((k, j) => (
          <div key={k} className={cx('au-palette-item', items.length + j === active && 'is-active')} onMouseEnter={() => setActive(items.length + j)} onClick={() => choose(items.length + j)}>
            <span className="au-avatar" style={{ '--kc': KINDS[k].color }}>＋</span>
            <div className="au-row-title">Créer « {q.trim()} » — {KINDS[k].label.toLowerCase()}</div>
          </div>
        ))}
        {!loading && total === 0 && <div className="au-faint" style={{ padding: 12, fontSize: 13 }}>Aucun résultat.</div>}
      </div>
    </div>
  );
}

// ── Tags ──────────────────────────────────────────────────────────────────

export function TagInput({ value = [], onChange, allTags = [], placeholder = 'Ajouter un tag…' }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const names = value.map((t) => (typeof t === 'string' ? t : t.name));
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const suggestions = allTags
    .filter((t) => !lower.has(t.name.toLowerCase()) && t.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const add = (name) => {
    const n = name.trim().replace(/^#/, '');
    if (!n || lower.has(n.toLowerCase())) { setQ(''); return; }
    onChange([...names, n]);
    setQ('');
  };
  const colorOf = (n) => allTags.find((t) => t.name.toLowerCase() === n.toLowerCase())?.color;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {names.map((n) => (
          <TagChip key={n} tag={{ name: n, color: colorOf(n) }} onRemove={() => onChange(names.filter((x) => x !== n))} />
        ))}
        <input className="au-inline" style={{ width: 'auto', flex: 1, minWidth: 130, margin: 0, padding: '3px 6px' }} value={q} placeholder={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(q); }
            if (e.key === 'Backspace' && !q && names.length) onChange(names.slice(0, -1));
          }} />
      </div>
      {focus && (suggestions.length > 0 || q.trim()) && (
        <div className="au-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4 }}>
          {suggestions.map((t) => (
            <button key={t.id} type="button" className="au-menu-item" onMouseDown={(e) => { e.preventDefault(); add(t.name); }}>
              <Dot color={t.color} /> {t.name} <span className="au-faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{t.used}</span>
            </button>
          ))}
          {q.trim() && !suggestions.some((t) => t.name.toLowerCase() === q.trim().toLowerCase()) && (
            <button type="button" className="au-menu-item" onMouseDown={(e) => { e.preventDefault(); add(q); }}>＋ Créer « {q.trim()} »</button>
          )}
        </div>
      )}
    </div>
  );
}

export const PALETTE = ['#c9a8e8', '#e88cb8', '#80c8e8', '#9ad4ae', '#e8d27c', '#e8a87c', '#ff8a9b', '#8a80a0'];

export function ColorDots({ value, onChange, colors = PALETTE, allowNone }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {allowNone && (
        <button type="button" aria-label="Sans couleur" onClick={() => onChange('')}
          style={{ width: 24, height: 24, borderRadius: 7, border: `2px solid ${!value ? 'var(--au-text)' : 'var(--au-border)'}`, background: 'transparent', cursor: 'pointer' }} />
      )}
      {colors.map((c) => (
        <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => onChange(c)}
          style={{ width: 24, height: 24, borderRadius: 7, background: c, cursor: 'pointer', border: `2px solid ${value === c ? 'var(--au-text)' : 'transparent'}` }} />
      ))}
    </div>
  );
}

// Forme de comparaison pour les filtres côté client (accents, casse).
export function normalizeQuery(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() / 1000 - ts;
  if (diff < 45) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`;
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Raccourci clavier global, ignoré quand on tape dans un champ (sauf `inFields`).
export function useHotkey(match, handler, { inFields = false, enabled = true } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (typing && !inFields) return;
      if (match(e)) ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match, inFields, enabled]);
}
