import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import {
  autoTypography, caretTop, findAll, frenchQuote, hitFrom, insertSeparator, replaceRange, setHeading, toggleLinePrefix, toggleWrap,
  wikiQueryAt, wikiTargetAt, wikiTargets,
} from '../editorOps';
import { FieldInput } from '../fields';
import { CHAPTER_STATUSES, chapterStatus, kindMeta } from '../kinds';
import { Markdown, normTitle } from '../markdown';
import { MARK_TYPES, findMarks, markSummary, newMark, resolveMark, swapVariant } from '../marks.js';
import { RelationsPanel } from '../RelationsPanel';
import { CommentsThread } from '../comments/CommentsThread';
import { BackupBanner, ConflictDialog, RevisionsDialog } from '../saving';
import { ChapterPublish } from '../sharing';
import { useFocusMode, useShellPage } from '../Shell';
import { formatCount, readingMinutes, textStats } from '../text';
import { Btn, Dialog, Empty, Field, Kbd, MOD, ProgressBar, PromptDialog, cx, humanError } from '../ui';
import { useEntityDoc } from '../useEntityDoc';

// Éditeur d'écriture : le texte d'un chapitre, en Markdown, dans une page
// pensée pour écrire longtemps (police à empattements, colonne étroite,
// interligne généreux). Formatage par boutons et raccourcis, compteurs en
// direct, typographie française automatique, liens [[Nom]] avec suggestions,
// mode focus, mode « machine à écrire », historique des versions. Le texte
// s'enregistre seul (et localement à chaque frappe).
//
// Marques de travail (marks.js) : « à reprendre », question, variante (deux
// versions d'un passage) — écrites dans le texte, privées, listées dans le
// panneau du chapitre. Recherche dans le texte (sans casse ni accents).
// Aperçu d'une fiche citée sans quitter la page : la sélection et la position
// de lecture sont retrouvées à la fermeture.
//
// Saisie par composition (coréen, accents morts) : aucun raccourci ni
// correction automatique n'agit tant qu'une composition est en cours — sinon
// la syllabe en train de se former serait validée ou cassée.

const PREFS_KEY = 'au-writer-prefs';
const DEFAULT_PREFS = { size: 19, width: 68, leading: 1.85, font: 'serif', typewriter: false, typo: true, side: true, counters: true };

// Une touche frappée pendant une composition (IME) : à laisser au clavier.
const composing = (e) => !!e.nativeEvent?.isComposing || e.keyCode === 229;

function usePrefs() {
  const [prefs, setPrefs] = useState(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
  });
  const set = useCallback((patch) => setPrefs((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);
  return [prefs, set];
}

// /ecrire → dernier chapitre écrit, sinon le premier.
export function WriterIndex() {
  const { pid, P } = useAuthor();
  const [target, setTarget] = useState(undefined);
  useEffect(() => {
    P.overview().then(async (o) => {
      if (o.lastChapter) { setTarget(o.lastChapter.id); return; }
      const plan = await P.plan.get();
      const first = [...plan.acts.flatMap((a) => a.items), ...plan.unassigned].find((i) => i.type === 'chapter');
      setTarget(first ? first.id : null);
    }).catch(() => setTarget(null));
  }, [P]);
  useShellPage({ crumbs: [{ label: 'Écriture' }], title: 'Écriture' });
  if (target === undefined) return <div className="au-page"><p className="au-muted">Ouverture…</p></div>;
  if (target) return <Navigate to={`/auteur/${pid}/ecrire/${target}`} replace />;
  return (
    <div className="au-page is-narrow">
      <Empty icon="✍️" title="Aucun chapitre à écrire" action={<Link className="au-btn is-primary" to={`/auteur/${pid}/chapitres`}>Créer un chapitre</Link>}>
        Crée ton premier chapitre pour ouvrir l&apos;éditeur.
      </Empty>
    </div>
  );
}

export function Writer() {
  const { id } = useParams();
  const chapterId = Number(id);
  const { pid, P, version, index } = useAuthor();
  const doc = useEntityDoc(chapterId, { debounce: 900 });
  const { doc: ch, status } = doc;
  const navigate = useNavigate();
  const toast = useToast();
  const [prefs, setPrefs] = usePrefs();
  const [focus, setFocus] = useFocusMode();
  const [preview, setPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sideMobile, setSideMobile] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [wiki, setWiki] = useState(null); // { start, query, active }
  const [find, setFind] = useState(null); // { query, i } — recherche dans le texte
  const [cards, setCards] = useState(false); // fiches citées dans le chapitre
  const [peek, setPeek] = useState(null); // { name, ent, data, error } — aperçu d'une fiche
  const ta = useRef(null);
  const findAnchor = useRef(0);
  const findInput = useRef(null);
  const keptSel = useRef(null);
  const scroller = useRef(null);
  const sessionStart = useRef(null);

  useShellPage({
    crumbs: [{ label: 'Chapitres', to: `/auteur/${pid}/chapitres` }, { label: ch ? `${ch.number ? `${ch.number}. ` : ''}${ch.title}` : '…' }],
    full: true,
    title: ch ? `✍️ ${ch.title}` : 'Écriture',
  });

  useEffect(() => {
    P.plan.get().then((plan) => setChapters([...plan.acts.flatMap((a) => a.items), ...plan.unassigned].filter((i) => i.type === 'chapter')))
      .catch(() => {});
  }, [P, version]);

  useEffect(() => { sessionStart.current = null; setWiki(null); setPreview(false); setFind(null); setCards(false); setPeek(null); }, [chapterId]);
  useEffect(() => () => setFocus(false), [setFocus]);

  const content = ch?.content ?? '';
  const stats = useMemo(() => textStats(content), [content]);
  if (ch && sessionStart.current === null && status !== 'loading') sessionStart.current = stats.words;
  const sessionDelta = sessionStart.current === null ? 0 : stats.words - sessionStart.current;

  const pos = chapters.findIndex((c) => c.id === chapterId);
  const prev = pos > 0 ? chapters[pos - 1] : null;
  const next = pos >= 0 && pos < chapters.length - 1 ? chapters[pos + 1] : null;

  // ── Suggestions [[Nom]] ─────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    if (!wiki) return [];
    const q = normTitle(wiki.query);
    return index.filter((e) => e.id !== chapterId && (!q || normTitle(e.title).includes(q) || e.aliases.some((a) => normTitle(a).includes(q))))
      .slice(0, 8);
  }, [wiki, index, chapterId]);

  const insertWiki = (e) => {
    const t = ta.current;
    if (!t || !wiki) return;
    const text = `[[${e.title}]]`;
    replaceRange(t, wiki.start, t.selectionStart, text, wiki.start + text.length);
    setWiki(null);
  };

  // ── Curseur visible ─────────────────────────────────────────────────────
  const revealCaret = useCallback(() => {
    const t = ta.current;
    const sc = scroller.current;
    if (!t || !sc) return;
    const y = t.offsetTop + caretTop(t);
    if (y < sc.scrollTop + 48 || y > sc.scrollTop + sc.clientHeight - 96) sc.scrollTop = Math.max(0, y - sc.clientHeight * 0.4);
  }, []);
  const jumpTo = (start, end = start) => {
    setPreview(false);
    setSideMobile(false);
    requestAnimationFrame(() => {
      const t = ta.current;
      if (!t) return;
      t.focus({ preventScroll: true });
      t.setSelectionRange(start, end);
      revealCaret();
    });
  };

  // ── Marques de travail ──────────────────────────────────────────────────
  const marks = useMemo(() => findMarks(content), [content]);
  const addMark = (type) => {
    const t = ta.current;
    if (!t || preview) return;
    const { selectionStart: a, selectionEnd: b, value } = t;
    const sel = value.slice(a, b);
    const m = newMark(type, sel);
    if (m.after) {
      const gap = b > 0 && !/\s/.test(value[b - 1]) ? ' ' : '';
      replaceRange(t, b, b, gap + m.text, b + gap.length + m.caret);
    } else replaceRange(t, a, b, m.text, a + m.caret);
  };
  // Remplacement d'une plage : par le textarea quand il est affiché (l'annulation
  // native reste possible), sinon directement dans le document.
  const applyRange = (r) => {
    const t = ta.current;
    if (t && !preview) replaceRange(t, r.start, r.end, r.text, r.start, r.start + r.text.length);
    else doc.setField('content', content.slice(0, r.start) + r.text + content.slice(r.end));
  };
  const markOps = {
    go: (m) => jumpTo(m.start, m.end),
    swap: (m) => applyRange(swapVariant(m)),
    resolve: (m, keep) => applyRange(resolveMark(content, m, keep)),
  };

  // ── Recherche dans le texte ─────────────────────────────────────────────
  const hits = useMemo(() => (find?.query ? findAll(content, find.query) : []), [find?.query, content]);
  const showHit = (i) => {
    const h = hits[i];
    const t = ta.current;
    if (!h || !t) return;
    t.setSelectionRange(h[0], h[1]);
    revealCaret();
    setFind((f) => (f ? { ...f, i } : f));
  };
  const openFind = () => {
    const t = ta.current;
    setPreview(false);
    findAnchor.current = t ? t.selectionStart : 0;
    const sel = t ? t.value.slice(t.selectionStart, t.selectionEnd) : '';
    setFind((f) => ({ query: sel && !sel.includes('\n') && sel.length < 80 ? sel : f?.query || '', i: -1 }));
    requestAnimationFrame(() => { findInput.current?.focus(); findInput.current?.select(); });
  };
  const closeFind = () => { setFind(null); requestAnimationFrame(() => ta.current?.focus({ preventScroll: true })); };
  // Nouvelle recherche : la première occurrence à partir du curseur.
  useEffect(() => {
    if (!find?.query) return;
    const i = hitFrom(hits, findAnchor.current);
    if (i >= 0) showHit(i); else setFind((f) => (f ? { ...f, i: -1 } : f));
  }, [find?.query]); // eslint-disable-line

  // ── Fiches citées : aperçu sans perdre sa place ─────────────────────────
  const resolveName = useCallback((n) => {
    const k = normTitle(n);
    return index.find((e) => normTitle(e.title) === k || e.aliases.some((a) => normTitle(a) === k)) || null;
  }, [index]);
  const linked = useMemo(() => wikiTargets(content).map((name) => ({ name, ent: resolveName(name) })), [content, resolveName]);
  const rememberSel = () => {
    const t = ta.current;
    if (keptSel.current || !t) return;
    keptSel.current = { s: t.selectionStart, e: t.selectionEnd, top: scroller.current?.scrollTop ?? 0 };
  };
  const restoreSel = () => {
    const k = keptSel.current;
    keptSel.current = null;
    if (!k) return;
    requestAnimationFrame(() => {
      const t = ta.current;
      if (!t) return;
      t.focus({ preventScroll: true });
      t.setSelectionRange(k.s, k.e);
      if (scroller.current) scroller.current.scrollTop = k.top;
    });
  };
  const openPeek = (name) => {
    rememberSel();
    const ent = resolveName(name);
    setCards(true);
    setPeek({ name, ent, data: null, error: null });
    if (ent) {
      P.entities.get(ent.id)
        .then((data) => setPeek((p) => (p && p.name === name ? { ...p, data } : p)))
        .catch((error) => setPeek((p) => (p && p.name === name ? { ...p, error } : p)));
    }
  };
  const openCards = () => {
    rememberSel();
    const t = ta.current;
    const under = t && !preview ? wikiTargetAt(t.value, t.selectionStart) : null;
    if (under) openPeek(under); else { setPeek(null); setCards(true); }
  };
  const closeCards = () => { setCards(false); setPeek(null); restoreSel(); };

  // ── Machine à écrire : la ligne en cours reste vers le milieu de l'écran ──
  const keepCaretInView = useCallback(() => {
    const t = ta.current;
    const sc = scroller.current;
    if (!t || !sc || !prefs.typewriter) return;
    const y = t.offsetTop + caretTop(t);
    sc.scrollTop = Math.max(0, y - sc.clientHeight * 0.42);
  }, [prefs.typewriter]);

  // Le textarea grandit avec le texte : c'est la page qui défile, pas lui.
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    const keep = scroller.current?.scrollTop;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    if (scroller.current && keep !== undefined) scroller.current.scrollTop = keep;
  }, [content, prefs.size, prefs.width, prefs.font, prefs.leading, preview]);

  const onChange = (e) => {
    doc.setField('content', e.target.value);
    const t = e.target;
    const w = wikiQueryAt(t.value, t.selectionStart);
    setWiki(w ? { ...w, active: 0 } : null);
    if (prefs.typewriter) requestAnimationFrame(keepCaretInView);
  };

  const fmt = (op) => {
    const t = ta.current;
    if (!t || preview) return;
    op(t);
  };

  const onKeyDown = (e) => {
    if (composing(e)) return; // la composition en cours appartient au clavier
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && e.key === 'Enter') { e.preventDefault(); openCards(); return; }
    if (wiki && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setWiki({ ...wiki, active: (wiki.active + 1) % suggestions.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setWiki({ ...wiki, active: (wiki.active - 1 + suggestions.length) % suggestions.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertWiki(suggestions[wiki.active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setWiki(null); return; }
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleWrap(e.target, '**'); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); toggleWrap(e.target, '*'); return; }
    if (mod && e.shiftKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { e.preventDefault(); setHeading(e.target, Number(e.code.slice(-1))); return; }
    if (mod && e.shiftKey && e.code === 'Digit7') { e.preventDefault(); toggleLinePrefix(e.target, 'ol'); return; }
    if (mod && e.shiftKey && e.code === 'Digit8') { e.preventDefault(); toggleLinePrefix(e.target, 'ul'); return; }
    if (mod && e.shiftKey && e.code === 'Digit9') { e.preventDefault(); toggleLinePrefix(e.target, 'quote'); return; }
    if (prefs.typo && e.key === '"' && !mod) { e.preventDefault(); frenchQuote(e.target); return; }
    // Liste : Entrée prolonge la puce ; Entrée sur une puce vide la termine.
    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      const t = e.target;
      const { selectionStart: s, value } = t;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const line = value.slice(lineStart, s);
      const m = line.match(/^(\s*)([-*+]|\d+\.|>)\s+(.*)$/);
      if (m && t.selectionEnd === s) {
        e.preventDefault();
        if (!m[3].trim()) { replaceRange(t, lineStart, s, '', lineStart); return; }
        const marker = /^\d+\.$/.test(m[2]) ? `${Number(m[2].slice(0, -1)) + 1}.` : m[2];
        replaceRange(t, s, s, `\n${m[1]}${marker} `);
      }
    }
  };

  const onKeyUp = (e) => {
    if (composing(e)) return;
    if (prefs.typo && (e.key === '.' || e.key === '-')) autoTypography(e.target);
  };

  // Raccourcis de page : enregistrer, mode focus.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); doc.save(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocus((f) => !f); }
      // Rechercher dans le chapitre (la recherche du navigateur ne sait pas
      // montrer une occurrence dans une zone de saisie).
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && (document.activeElement === ta.current || find)) { e.preventDefault(); openFind(); }
      if (e.key === 'Escape' && find) { closeFind(); return; }
      if (e.key === 'Escape' && focus && !wiki) setFocus(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, focus, setFocus, wiki, find]); // eslint-disable-line

  const snapshot = async (label) => {
    setSnapOpen(false);
    try {
      await doc.save();
      await P.revisions.create(chapterId, { field: 'content', label, body: ch.content });
      toast.success('Version enregistrée dans l\'historique');
    } catch (err) { toast.error(humanError(err)); }
  };

  if (!ch) {
    return (
      <div className="au-page">
        {status === 'error'
          ? <Empty icon="🫥" title="Chapitre introuvable" action={<Link className="au-btn" to={`/auteur/${pid}/chapitres`}>Chapitres</Link>}>{humanError(doc.error)}</Empty>
          : <p className="au-muted">Ouverture du chapitre…</p>}
      </div>
    );
  }
  if (ch.kind !== 'chapter') return <Navigate to={`/auteur/${pid}/e/${ch.id}`} replace />;

  const st = chapterStatus(ch.status);
  const target = ch.targetWords || 0;
  const editorStyle = {
    '--w-size': `${prefs.size}px`,
    '--w-width': `${prefs.width}ch`,
    '--w-leading': String(prefs.leading),
    '--w-font': prefs.font === 'serif' ? 'var(--au-serif)' : 'var(--au-font)',
  };
  const tools = [
    ['H1', 'Titre 1', `${MOD}⇧1`, () => fmt((t) => setHeading(t, 1))],
    ['H2', 'Titre 2', `${MOD}⇧2`, () => fmt((t) => setHeading(t, 2))],
    ['H3', 'Titre 3', `${MOD}⇧3`, () => fmt((t) => setHeading(t, 3))],
    ['B', 'Gras', `${MOD}B`, () => fmt((t) => toggleWrap(t, '**')), { fontWeight: 800 }],
    ['I', 'Italique', `${MOD}I`, () => fmt((t) => toggleWrap(t, '*')), { fontStyle: 'italic', fontFamily: 'var(--au-serif)' }],
    ['❝', 'Citation', `${MOD}⇧9`, () => fmt((t) => toggleLinePrefix(t, 'quote'))],
    ['•', 'Liste', `${MOD}⇧8`, () => fmt((t) => toggleLinePrefix(t, 'ul'))],
    ['1.', 'Liste numérotée', `${MOD}⇧7`, () => fmt((t) => toggleLinePrefix(t, 'ol'))],
    ['—', 'Séparateur de scène', '', () => fmt(insertSeparator)],
    ['[[', 'Lier une fiche', '[[', () => fmt((t) => replaceRange(t, t.selectionStart, t.selectionEnd, '[[', t.selectionStart + 2))],
    ...Object.entries(MARK_TYPES).map(([type, meta]) => [meta.icon, `${meta.label} — ${meta.hint}`, '', () => addMark(type)]),
  ];

  return (
    <div className={cx('au-writer', focus && 'is-focus', prefs.side && 'has-side')} style={editorStyle}>
      <ConflictDialog doc={ch} conflict={doc.conflict} onResolve={doc.resolveConflict} />

      {!focus && (
        <div className="au-writer-bar">
          <div className="au-writer-nav">
            <Btn size="small" variant="ghost" icon disabled={!prev} onClick={() => prev && navigate(`/auteur/${pid}/ecrire/${prev.id}`)} title="Chapitre précédent" aria-label="Chapitre précédent">‹</Btn>
            <select className="au-select au-writer-select" value={chapterId} onChange={(e) => navigate(`/auteur/${pid}/ecrire/${e.target.value}`)} aria-label="Changer de chapitre">
              {ch.local && <option value={ch.id}>📴 {ch.title || 'Sans titre'}</option>}
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}
            </select>
            <Btn size="small" variant="ghost" icon disabled={!next} onClick={() => next && navigate(`/auteur/${pid}/ecrire/${next.id}`)} title="Chapitre suivant" aria-label="Chapitre suivant">›</Btn>
          </div>
          <div className="au-writer-tools" role="toolbar" aria-label="Mise en forme">
            {tools.map(([label, title, kb, run, style]) => (
              <button key={title} type="button" className="au-tool" title={kb ? `${title} (${kb})` : title} aria-label={title}
                onMouseDown={(e) => e.preventDefault()} onClick={run} disabled={preview} style={style}>{label}</button>
            ))}
          </div>
          <div className="au-writer-right">
            <Btn size="small" variant="ghost" icon on={!!find} onClick={() => (find ? closeFind() : openFind())} title={`Rechercher dans le chapitre (${MOD}F)`} aria-label="Rechercher dans le chapitre">🔍</Btn>
            <Btn size="small" variant="ghost" icon onMouseDown={(e) => e.preventDefault()} onClick={openCards} title="Fiches citées dans ce chapitre (Alt Entrée sur un lien)" aria-label="Fiches citées dans ce chapitre">🗂</Btn>
            <Btn size="small" variant="ghost" on={preview} onClick={() => setPreview((p) => !p)} title="Aperçu mis en page">{preview ? '✎' : '👁'}<span className="au-desktop-only">{preview ? 'Écrire' : 'Aperçu'}</span></Btn>
            {!ch.local && <Btn size="small" variant="ghost" className="au-desktop-only" onClick={async () => { await doc.save(); setHistory(true); }} title="Historique des versions">🕘 Versions</Btn>}
            <Btn size="small" variant="ghost" icon onClick={() => setSettings(true)} title="Réglages d'affichage" aria-label="Réglages d'affichage">Aa</Btn>
            <Btn size="small" variant="ghost" icon className="au-desktop-only" on={prefs.side} onClick={() => setPrefs({ side: !prefs.side })} title="Panneau du chapitre" aria-label="Panneau du chapitre">◧</Btn>
            <Btn size="small" variant="ghost" icon className="au-mobile-only" onClick={() => setSideMobile(true)} aria-label="Infos du chapitre">ⓘ</Btn>
            <Btn size="small" icon onClick={() => setFocus(true)} title={`Mode focus (${MOD}⇧F)`} aria-label="Mode focus">⛶</Btn>
          </div>
        </div>
      )}

      {find && (
        <div className="au-find" role="search">
          <input
            ref={findInput} className="au-input au-find-input" type="search" value={find.query} placeholder="Rechercher dans le chapitre"
            aria-label="Rechercher dans le chapitre" enterKeyHint="search"
            onChange={(e) => { findAnchor.current = ta.current?.selectionStart ?? 0; setFind({ query: e.target.value, i: -1 }); }}
            onKeyDown={(e) => {
              if (composing(e)) return;
              if (e.key === 'Enter' && hits.length) { e.preventDefault(); showHit(((find.i < 0 ? 0 : find.i) + (e.shiftKey ? hits.length - 1 : 1)) % hits.length); }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
            }}
          />
          <span className="au-find-count" aria-live="polite">{find.query ? (hits.length ? `${find.i + 1} / ${hits.length}` : 'Aucun résultat') : ''}</span>
          <Btn size="small" variant="ghost" icon disabled={!hits.length} onClick={() => showHit((find.i - 1 + hits.length) % hits.length)} aria-label="Occurrence précédente">↑</Btn>
          <Btn size="small" variant="ghost" icon disabled={!hits.length} onClick={() => showHit((find.i + 1) % hits.length)} aria-label="Occurrence suivante">↓</Btn>
          <Btn size="small" variant="ghost" icon onClick={closeFind} aria-label="Fermer la recherche">✕</Btn>
        </div>
      )}

      <div className="au-writer-body">
        <div className="au-writer-scroll" ref={scroller}>
          <div className="au-writer-paper">
            <BackupBanner backup={doc.backup} onRestore={doc.restoreBackup} onDiscard={doc.discardBackup} />
            <input className="au-writer-title" value={ch.title} onChange={(e) => doc.setField('title', e.target.value)} placeholder="Titre du chapitre" aria-label="Titre du chapitre" maxLength={200} />
            <div className="au-writer-kicker">
              {ch.number ? `Chapitre ${ch.number}` : 'Chapitre'}{ch.actTitle ? ` · ${ch.actTitle}` : ''}
              <span className="au-pill" style={{ '--pill': st.color, marginLeft: 8 }}>{st.label}</span>
            </div>
            {preview ? (
              <div className="au-writer-preview" onDoubleClick={() => setPreview(false)}>
                <Markdown content={content} pid={pid} resolve={resolveName} />
              </div>
            ) : (
              <div className="au-writer-textwrap">
                {/* Occurrences de la recherche : calque sous le texte, à la même mise en
                    page (la sélection d'une zone de saisie sans le focus ne se voit pas). */}
                {find && hits.length > 0 && (
                  <div className="au-writer-text au-writer-hl" aria-hidden lang="fr">
                    {hits.map(([a, b], i) => (
                      <span key={a}>
                        {content.slice(i ? hits[i - 1][1] : 0, a)}
                        <mark className={i === find.i ? 'is-current' : undefined}>{content.slice(a, b)}</mark>
                      </span>
                    ))}
                    {content.slice(hits[hits.length - 1][1])}
                  </div>
                )}
                <textarea ref={ta} className="au-writer-text" value={content} onChange={onChange} onKeyDown={onKeyDown} onKeyUp={onKeyUp}
                  onClick={(e) => { const w = wikiQueryAt(e.target.value, e.target.selectionStart); setWiki(w ? { ...w, active: 0 } : null); }}
                  placeholder="Il était une fois…" spellCheck lang="fr" aria-label="Texte du chapitre" autoFocus />
              </div>
            )}
          </div>
          {wiki && suggestions.length > 0 && !preview && (
            <div className="au-wiki-pop" role="listbox" aria-label="Fiches à lier">
              <div className="au-faint" style={{ fontSize: 11, padding: '4px 8px' }}>Lier une fiche — ↑↓ puis Entrée</div>
              {suggestions.map((e, i) => (
                <button key={e.id} type="button" role="option" aria-selected={i === wiki.active}
                  className={cx('au-menu-item', i === wiki.active && 'is-active')}
                  onMouseDown={(ev) => { ev.preventDefault(); insertWiki(e); }}>
                  <span aria-hidden>{e.icon || kindMeta(e.kind).icon}</span> {e.title}
                  <span className="au-faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{kindMeta(e.kind).label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {prefs.side && !focus && (
          <aside className="au-writer-side au-desktop-only">
            <ChapterSide ch={ch} doc={doc} marks={marks} markOps={markOps} />
          </aside>
        )}
      </div>

      <div className="au-writer-status" aria-live="polite">
        {prefs.counters && (
          <>
            <span><strong>{formatCount(stats.words)}</strong> mots</span>
            <span className="au-desktop-only">{formatCount(stats.chars)} signes</span>
            <span className="au-desktop-only">~{readingMinutes(stats.words)} min de lecture</span>
            {sessionDelta !== 0 && <span style={{ color: sessionDelta > 0 ? 'var(--au-ok)' : 'var(--au-warn)' }}>{sessionDelta > 0 ? '+' : ''}{formatCount(sessionDelta)} cette séance</span>}
            {target > 0 && <span className="au-writer-goal"><ProgressBar value={stats.words / target} /> {Math.round((stats.words / target) * 100)} %</span>}
          </>
        )}
        {marks.length > 0 && <button type="button" className="au-writer-marks" onClick={() => markOps.go(marks[0])} title="Aller à la première marque">{marks.length} marque{marks.length > 1 ? 's' : ''}</button>}
        <span className={cx('au-writer-save', `is-${status}`)}>
          {{
            saving: 'Envoi…', dirty: 'Modifié', error: '⚠ Échec — action requise', conflict: '⚠ Conflit à résoudre',
            offline: '📴 Sauvegardé sur cet appareil', local: '📴 En attente d\'envoi',
            auth: '🔑 Session expirée — sauvegardé sur cet appareil', denied: '🚫 Accès refusé — sauvegardé sur cet appareil',
          }[status] || '✓ Synchronisé'}
        </span>
        {focus && <Btn size="small" variant="ghost" onClick={() => setFocus(false)}>Quitter le focus <Kbd>Échap</Kbd></Btn>}
      </div>

      <RevisionsDialog open={history} onClose={() => setHistory(false)} entity={ch} field="content" current={content} onRestored={() => doc.reload()} />
      <PromptDialog open={snapOpen} title="📌 Enregistrer une version" label="Nom de la version" placeholder="avant la réécriture de la fin" confirmLabel="Enregistrer" onClose={() => setSnapOpen(false)} onSubmit={snapshot} />
      <Dialog open={settings} onClose={() => setSettings(false)} title="Affichage de l'éditeur" width={460}
        footer={<>{!ch.local && <Btn variant="ghost" onClick={() => setSnapOpen(true)} style={{ marginRight: 'auto' }}>📌 Enregistrer une version…</Btn>}<Btn variant="primary" onClick={() => setSettings(false)}>OK</Btn></>}>
        <Field label={`Taille du texte — ${prefs.size}px`}>
          <input type="range" min="15" max="26" value={prefs.size} onChange={(e) => setPrefs({ size: Number(e.target.value) })} style={{ width: '100%' }} />
        </Field>
        <Field label={`Largeur de colonne — ${prefs.width} caractères`}>
          <input type="range" min="45" max="100" value={prefs.width} onChange={(e) => setPrefs({ width: Number(e.target.value) })} style={{ width: '100%' }} />
        </Field>
        <Field label={`Interligne — ${Number(prefs.leading).toFixed(2).replace('.', ',')}`}>
          <input type="range" min="1.3" max="2.3" step="0.05" value={prefs.leading} onChange={(e) => setPrefs({ leading: Number(e.target.value) })} style={{ width: '100%' }} />
        </Field>
        <Field label="Police">
          <div className="au-seg">
            <button type="button" className={cx(prefs.font === 'serif' && 'is-on')} onClick={() => setPrefs({ font: 'serif' })} style={{ fontFamily: 'var(--au-serif)' }}>Avec empattements</button>
            <button type="button" className={cx(prefs.font === 'sans' && 'is-on')} onClick={() => setPrefs({ font: 'sans' })}>Sans empattements</button>
          </div>
        </Field>
        <label className="au-check-row"><input type="checkbox" className="au-check" checked={prefs.typewriter} onChange={(e) => setPrefs({ typewriter: e.target.checked })} /> Mode machine à écrire (la ligne en cours reste au centre)</label>
        <label className="au-check-row"><input type="checkbox" className="au-check" checked={prefs.typo} onChange={(e) => setPrefs({ typo: e.target.checked })} /> Typographie française automatique (« », …, —)</label>
        <label className="au-check-row"><input type="checkbox" className="au-check" checked={prefs.counters} onChange={(e) => setPrefs({ counters: e.target.checked })} /> Afficher les compteurs (mots, signes, objectif)</label>
        <p className="au-faint" style={{ fontSize: 12, marginTop: 10 }}>
          Raccourcis : <Kbd>{MOD} B</Kbd> gras · <Kbd>{MOD} I</Kbd> italique · <Kbd>{MOD} ⇧ 1-3</Kbd> titres · <Kbd>{MOD} ⇧ 7/8</Kbd> listes · <Kbd>{MOD} ⇧ 9</Kbd> citation · <Kbd>{MOD} S</Kbd> enregistrer · <Kbd>{MOD} F</Kbd> rechercher · <Kbd>{MOD} ⇧ F</Kbd> focus · <Kbd>[[</Kbd> lier une fiche · <Kbd>Alt Entrée</Kbd> voir la fiche sous le curseur
        </p>
      </Dialog>
      <Dialog open={sideMobile} onClose={() => setSideMobile(false)} title={`Chapitre ${ch.number || ''}`}>
        {!ch.local && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <Btn size="small" onClick={async () => { setSideMobile(false); await doc.save(); setHistory(true); }}>🕘 Versions</Btn>
            <Btn size="small" onClick={() => { setSideMobile(false); setSnapOpen(true); }}>📌 Enregistrer une version</Btn>
          </div>
        )}
        <ChapterSide ch={ch} doc={doc} marks={marks} markOps={markOps} />
      </Dialog>
      <Dialog open={cards} onClose={closeCards} title={peek ? `${peek.ent ? (peek.ent.icon || kindMeta(peek.ent.kind).icon) : '🫥'} ${peek.ent?.title || peek.name}` : '🗂 Fiches citées dans ce chapitre'} width={520} initialFocus={false}
        footer={<>
          {peek && linked.length > 1 && <Btn variant="ghost" onClick={() => setPeek(null)} style={{ marginRight: 'auto' }}>← Toutes les fiches citées</Btn>}
          {peek?.ent && <Link className="au-btn is-ghost" to={`/auteur/${pid}/e/${peek.ent.id}`}>Ouvrir la fiche</Link>}
          <Btn variant="primary" onClick={closeCards}>Revenir au texte</Btn>
        </>}>
        {!peek && (linked.length === 0
          ? <p className="au-muted">Aucune fiche citée pour l&apos;instant. Tape <Kbd>[[</Kbd> dans le texte pour en lier une.</p>
          : (
            <div className="au-peek-list">
              {linked.map(({ name, ent }) => (
                <button key={name} type="button" className="au-menu-item" onClick={() => openPeek(name)}>
                  <span aria-hidden>{ent ? (ent.icon || kindMeta(ent.kind).icon) : '🫥'}</span> {ent?.title || name}
                  <span className="au-faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{ent ? kindMeta(ent.kind).label : 'aucune fiche à ce nom'}</span>
                </button>
              ))}
            </div>
          ))}
        {peek && !peek.ent && <p className="au-muted">Aucune fiche ne porte le nom « {peek.name} ». Le lien restera en pointillés tant qu&apos;elle n&apos;existe pas.</p>}
        {peek?.ent && !peek.data && !peek.error && <p className="au-muted">Ouverture…</p>}
        {peek?.error && <p className="au-offline-note">Cette fiche n&apos;est pas disponible pour l&apos;instant ({humanError(peek.error)}).</p>}
        {peek?.data && (
          <div className="au-peek">
            <div className="au-faint" style={{ fontSize: 12 }}>{kindMeta(peek.data.kind).label}{peek.data.aliases?.length ? ` · ${peek.data.aliases.map((a) => a.alias).join(', ')}` : ''}</div>
            {peek.data.summary && <p className="au-peek-summary">{peek.data.summary}</p>}
            {peek.data.body
              ? <Markdown content={peek.data.body} pid={pid} resolve={resolveName} />
              : !peek.data.summary && <p className="au-muted">Fiche encore vide.</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

// Marques posées dans le chapitre : y aller, inverser ou trancher une variante,
// lever une marque une fois le passage repris ou la question résolue.
function MarksList({ marks, ops }) {
  if (!marks.length) return null;
  return (
    <Field label={`Marques (${marks.length})`}>
      <ul className="au-marks">
        {marks.map((m) => {
          const meta = MARK_TYPES[m.type];
          const sum = markSummary(m);
          return (
            <li key={`${m.start}-${m.type}`} className={`au-marks-item is-${m.type}`}>
              <button type="button" className="au-marks-go" onClick={() => ops.go(m)} title="Aller à ce passage">
                <span aria-hidden>{meta.icon}</span>
                <span><span className="au-faint">{meta.label}</span><br />{sum.main}{sum.alt !== null && <><br /><span className="au-marks-alt">ou : {sum.alt}</span></>}</span>
              </button>
              <div className="au-marks-ops">
                {m.type === 'variante' ? (
                  <>
                    <Btn size="small" variant="ghost" onClick={() => ops.swap(m)} disabled={!m.b} title="L'autre version devient celle du texte">Inverser</Btn>
                    <Btn size="small" variant="ghost" onClick={() => ops.resolve(m, 'a')} title="Ne garder que la version du texte">Trancher</Btn>
                  </>
                ) : <Btn size="small" variant="ghost" onClick={() => ops.resolve(m)}>{m.type === 'question' ? 'Résolue' : 'C\'est repris'}</Btn>}
              </div>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

function ChapterSide({ ch, doc, marks = [], markOps }) {
  const { pid } = useAuthor();
  return (
    <div className="au-writer-sidein">
      <MarksList marks={marks} ops={markOps} />
      <Field label="Statut">
        <select className="au-select" value={ch.status} onChange={(e) => doc.setField('status', e.target.value)}>
          {CHAPTER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      {ch.local
        ? <p className="au-offline-note">📴 Chapitre créé hors connexion : il sera envoyé (et numéroté) au retour du réseau.</p>
        : <ChapterPublish ch={ch} beforeAction={doc.save} onChange={() => doc.refresh()} />}
      <Field label="Objectif de mots">
        <FieldInput def={{ key: 'targetWords', label: 'Objectif', type: 'number' }} doc={ch} setField={doc.setField} />
      </Field>
      <Field label="Résumé">
        <FieldInput def={{ key: 'summary', label: 'Résumé', type: 'area', rows: 3 }} doc={ch} setField={doc.setField} />
      </Field>
      {!ch.local && <RelationsPanel entity={ch} onChanged={doc.refresh} compact />}
      <Field label="Notes de chapitre" className="au-writer-notes">
        <FieldInput def={{ key: 'body', label: 'Notes', type: 'area', rows: 4 }} doc={ch} setField={doc.setField} />
      </Field>
      {!ch.local && <CommentsThread entityId={ch.id} />}
      <Link to={`/auteur/${pid}/e/${ch.id}`} className="au-btn is-ghost is-small">Fiche complète du chapitre →</Link>
    </div>
  );
}
