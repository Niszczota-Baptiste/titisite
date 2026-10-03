import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { triggerDownload } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { SharingPanel } from '../sharing';
import { useShellPage } from '../Shell';
import {
  Btn, ColorDots, Dialog, ErrorLine, Field, KindAvatar, PALETTE, Section, TagChip, humanError, relativeTime,
} from '../ui';

// Réglages du livre : identité, catégories configurables (lore, types de
// lieux), lignes de temps, tags, corbeille, sauvegardes.

export function Settings() {
  const { project } = useAuthor();
  useShellPage({ crumbs: [{ label: 'Réglages' }], title: 'Réglages' });
  if (!project) return <div className="au-page"><p className="au-muted">Chargement…</p></div>;
  return (
    <div className="au-page is-narrow">
      <div className="au-page-head"><div><h1>⚙️ Réglages</h1><div className="au-sub">{project.title}</div></div></div>
      <ProjectForm />
      <Section id="settings:sharing" title="👥 Partage"><SharingPanel /></Section>
      <Section id="settings:categories" title="🗂️ Catégories">
        <CategoriesEditor domain="lore" title="Lore (factions, religions, magie…)" />
        <CategoriesEditor domain="place" title="Types de lieux" />
      </Section>
      <Section id="settings:timelines" title="⏳ Lignes de temps"><TimelinesEditor /></Section>
      <Section id="settings:tags" title="🏷️ Tags"><TagsEditor /></Section>
      <Section id="settings:trash" title="🗑 Corbeille"><Trash /></Section>
      <Section id="settings:export" title="💾 Sauvegardes & export"><Exports /></Section>
      <Section id="settings:danger" title="⚠️ Zone sensible" defaultOpen={false}><Danger /></Section>
    </div>
  );
}

function ProjectForm() {
  const { P, project, setProject } = useAuthor();
  const toast = useToast();
  const [form, setForm] = useState({
    title: project.title, subtitle: project.subtitle, description: project.description,
    targetWords: project.targetWords ?? '', color: project.color,
  });
  const [error, setError] = useState(null);
  const dirty = form.title !== project.title || form.subtitle !== project.subtitle || form.description !== project.description
    || String(form.targetWords ?? '') !== String(project.targetWords ?? '') || form.color !== project.color;
  const save = async () => {
    try {
      const p = await P.update({ ...form, targetWords: form.targetWords === '' ? null : Number(form.targetWords) });
      setProject(p);
      toast.success('Livre mis à jour');
    } catch (err) { setError(err); }
  };
  return (
    <div className="au-card" style={{ marginBottom: 22 }}>
      <div className="au-card-title">📕 Le livre <span className="au-actions"><Link to="/auteur?choisir=1" className="au-btn is-ghost is-small">Changer de livre</Link></span></div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      <div className="au-grid2">
        <Field label="Titre" className="is-full"><input className="au-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Sous-titre"><input className="au-input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
        <Field label="Objectif de mots"><input className="au-input" type="number" min="0" value={form.targetWords} onChange={(e) => setForm({ ...form, targetWords: e.target.value })} /></Field>
        <Field label="Pitch / description" className="is-full"><textarea className="au-textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Couleur" className="is-full"><ColorDots value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </div>
      <Btn variant="primary" onClick={save} disabled={!dirty || !form.title.trim()}>Enregistrer</Btn>
    </div>
  );
}

function CategoriesEditor({ domain, title }) {
  const { P, categories, setCategories, bump } = useAuthor();
  const confirm = useConfirm();
  const toast = useToast();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const list = categories.filter((c) => c.domain === domain);
  const reload = async () => setCategories(await P.categories.list());
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { await P.categories.create({ domain, name: name.trim(), icon: icon.trim() }); setName(''); setIcon(''); reload(); } catch (err) { toast.error(humanError(err.body?.error || err)); }
  };
  const update = async (c, patch) => { try { await P.categories.update(c.id, patch); reload(); } catch (err) { toast.error(humanError(err.body?.error || err)); } };
  const remove = async (c) => {
    if (!(await confirm({ title: `Supprimer « ${c.name} » ?`, message: c.used ? `${c.used} élément(s) passeront « sans catégorie » (rien n'est supprimé).` : 'Aucun élément ne l\'utilise.', confirmLabel: 'Supprimer', danger: true }))) return;
    await P.categories.remove(c.id); reload(); bump();
  };
  const move = async (c, d) => {
    const i = list.indexOf(c);
    const other = list[i + d];
    if (!other) return;
    await Promise.all([P.categories.update(c.id, { position: other.position }), P.categories.update(other.id, { position: c.position })]);
    reload();
  };
  return (
    <div className="au-card" style={{ marginBottom: 12 }}>
      <div className="au-card-title">{title}</div>
      {list.map((c, i) => (
        <div key={c.id} className="au-cat-row">
          <input className="au-input" style={{ width: 54, textAlign: 'center' }} defaultValue={c.icon} maxLength={16} aria-label="Icône" onBlur={(e) => e.target.value !== c.icon && update(c, { icon: e.target.value })} />
          <input className="au-input" defaultValue={c.name} maxLength={80} aria-label="Nom" onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update(c, { name: e.target.value.trim() })} />
          <span className="au-faint" style={{ fontSize: 12, minWidth: 54, textAlign: 'right' }}>{c.used} élém.</span>
          <Btn size="small" variant="ghost" icon disabled={i === 0} onClick={() => move(c, -1)} aria-label="Monter">↑</Btn>
          <Btn size="small" variant="ghost" icon disabled={i === list.length - 1} onClick={() => move(c, 1)} aria-label="Descendre">↓</Btn>
          <Btn size="small" variant="ghost" icon onClick={() => remove(c)} aria-label="Supprimer">✕</Btn>
        </div>
      ))}
      <form onSubmit={add} className="au-cat-row" style={{ marginTop: 6 }}>
        <input className="au-input" style={{ width: 54, textAlign: 'center' }} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="✦" maxLength={16} aria-label="Icône" />
        <input className="au-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie…" maxLength={80} aria-label="Nom" />
        <Btn type="submit" size="small" disabled={!name.trim()}>Ajouter</Btn>
      </form>
    </div>
  );
}

function TimelinesEditor() {
  const { P, timelines, setTimelines, bump } = useAuthor();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const reload = async () => setTimelines(await P.timelines.list());
  const add = async (e) => { e.preventDefault(); if (!name.trim()) return; await P.timelines.create({ name: name.trim(), color: PALETTE[timelines.length % PALETTE.length] }); setName(''); reload(); };
  return (
    <div className="au-card">
      <p className="au-muted" style={{ fontSize: 13, marginBottom: 10 }}>Chaque ligne est une échelle ou un fil (histoire ancienne, récit principal…). Toutes partagent le même axe de « position chronologique ».</p>
      {timelines.map((t) => (
        <div key={t.id} className="au-cat-row">
          <input className="au-input" defaultValue={t.name} maxLength={120} aria-label="Nom" onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && P.timelines.update(t.id, { name: e.target.value.trim() }).then(reload)} />
          <ColorDots value={t.color} onChange={(c) => P.timelines.update(t.id, { color: c }).then(reload)} colors={PALETTE.slice(0, 6)} />
          <span className="au-faint" style={{ fontSize: 12 }}>{t.used} évén.</span>
          <Btn size="small" variant="ghost" icon aria-label="Supprimer" onClick={async () => {
            if (!(await confirm({ title: `Supprimer « ${t.name} » ?`, message: 'Ses événements restent, « sans ligne de temps ».', confirmLabel: 'Supprimer', danger: true }))) return;
            await P.timelines.remove(t.id); reload(); bump();
          }}>✕</Btn>
        </div>
      ))}
      <form onSubmit={add} className="au-cat-row" style={{ marginTop: 6 }}>
        <input className="au-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle ligne de temps…" maxLength={120} />
        <Btn type="submit" size="small" disabled={!name.trim()}>Ajouter</Btn>
      </form>
    </div>
  );
}

function TagsEditor() {
  const { P, tags, reloadTags, bump } = useAuthor();
  const confirm = useConfirm();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [name, setName] = useState('');
  const save = async () => {
    try {
      const r = await P.tags.update(edit.id, { name: name.trim(), color: edit.color });
      if (r.merged) toast.info(`Fusionné avec #${r.tag.name}`);
      setEdit(null); reloadTags(); bump();
    } catch (err) { toast.error(humanError(err)); }
  };
  if (tags.length === 0) return <p className="au-muted" style={{ fontSize: 13 }}>Aucun tag pour l&apos;instant : ajoute-en depuis n&apos;importe quelle fiche.</p>;
  return (
    <div className="au-card">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((t) => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <TagChip tag={t} onClick={() => { setEdit(t); setName(t.name); }} />
            <span className="au-faint" style={{ fontSize: 11 }}>{t.used}</span>
          </span>
        ))}
      </div>
      <p className="au-faint" style={{ fontSize: 12, marginTop: 8 }}>Clique un tag pour le renommer, le recolorer ou le supprimer. Renommer vers un tag existant fusionne les deux.</p>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={`#${edit?.name}`} width={420}
        footer={edit && (
          <>
            <Btn variant="danger" style={{ marginRight: 'auto' }} onClick={async () => {
              if (!(await confirm({ title: `Supprimer #${edit.name} ?`, message: 'Il est retiré de tous les éléments (les éléments restent).', confirmLabel: 'Supprimer', danger: true }))) return;
              await P.tags.remove(edit.id); setEdit(null); reloadTags(); bump();
            }}>Supprimer</Btn>
            <Btn variant="primary" onClick={save} disabled={!name.trim()}>Enregistrer</Btn>
          </>
        )}>
        {edit && (
          <>
            <Field label="Nom"><input className="au-input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus /></Field>
            <Field label="Couleur"><ColorDots value={edit.color} onChange={(c) => setEdit({ ...edit, color: c })} /></Field>
          </>
        )}
      </Dialog>
    </div>
  );
}

function Trash() {
  const { pid, P, version, bump } = useAuthor();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const load = useCallback(() => P.trash().then((r) => setItems(r.items)).catch(() => setItems([])), [P]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { if (window.location.hash === '#corbeille') document.getElementById('au-trash')?.scrollIntoView(); }, [items]);
  if (!items) return null;
  return (
    <div className="au-card" id="au-trash">
      {items.length === 0 && <p className="au-muted" style={{ fontSize: 13 }}>La corbeille est vide.</p>}
      {items.map((e) => (
        <div key={e.id} className="au-row" style={{ cursor: 'default' }}>
          <KindAvatar entity={e} />
          <span className="au-row-main">
            <span className="au-row-title" style={{ display: 'block' }}>{e.title}</span>
            <span className="au-row-meta">{kindMeta(e.kind).label} · supprimé {relativeTime(e.deletedAt)}</span>
          </span>
          <Btn size="small" onClick={async () => { await P.entities.restore(e.id); bump(); load(); }}>Restaurer</Btn>
          <Btn size="small" variant="danger" onClick={async () => {
            if (!(await confirm({ title: 'Supprimer définitivement ?', message: `« ${e.title} », ses relations et son historique seront effacés. Irréversible.`, confirmLabel: 'Supprimer définitivement', danger: true }))) return;
            await P.entities.purge(e.id); load();
          }}>Effacer</Btn>
        </div>
      ))}
      {items.length > 0 && <p className="au-faint" style={{ fontSize: 12, marginTop: 6 }}>Les éléments restent ici jusqu&apos;à ce que tu les effaces. <Link to={`/auteur/${pid}`} style={{ color: 'var(--au-acc)' }}>Retour au livre</Link></p>}
    </div>
  );
}

function Exports() {
  const { P, project } = useAuthor();
  const toast = useToast();
  const slug = (project.title || 'livre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'livre';
  const dl = async (url, name) => { try { await triggerDownload(url, name); } catch (err) { toast.error(humanError(err)); } };
  const date = new Date().toISOString().slice(0, 10);
  return (
    <div className="au-card">
      <p className="au-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Tout est déjà enregistré sur le serveur (et inclus dans ses sauvegardes). Ces exports sont un filet de sécurité supplémentaire, à garder chez toi.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={() => dl(P.exportUrl, `${slug}-sauvegarde-${date}.json`)}>💾 Sauvegarde complète (JSON)</Btn>
        <Btn onClick={() => dl(P.manuscriptUrl, `${slug}-manuscrit-${date}.md`)}>📄 Manuscrit (Markdown)</Btn>
      </div>
    </div>
  );
}

function Danger() {
  const { P, project } = useAuthor();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const remove = async () => {
    try { await P.remove(text); try { localStorage.removeItem('au-last-project'); } catch { /* ignore */ } navigate('/auteur?choisir=1'); } catch (err) { setError(err); }
  };
  return (
    <div className="au-card" style={{ borderColor: 'color-mix(in srgb, var(--au-danger) 40%, transparent)' }}>
      <ErrorLine error={error} />
      <p className="au-muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Supprimer le livre efface définitivement tout son contenu (fiches, chapitres, images…). Exporte une sauvegarde avant. Pour confirmer, retape exactement son titre : <strong>{project.title}</strong>
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="au-input" style={{ flex: 1, minWidth: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={project.title} aria-label="Titre à retaper" />
        <Btn variant="danger" disabled={text !== project.title} onClick={remove}>Supprimer le livre</Btn>
      </div>
    </div>
  );
}
