import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { kindMeta } from './kinds';
import { Markdown } from './markdown';
import { Btn, Dialog, ErrorLine, cx, formatDateTime, humanError, relativeTime } from './ui';

// Tout ce qui protège le texte : brouillon local retrouvé, conflit entre deux
// appareils, historique des versions.

const FIELD_LABELS = {
  title: 'Titre', summary: 'Résumé', body: 'Texte', content: 'Contenu du chapitre', tags: 'Tags', aliases: 'Alias',
};

export function BackupBanner({ backup, onRestore, onDiscard }) {
  if (!backup) return null;
  return (
    <div className="au-banner" role="alert">
      <span>📝 Des modifications de cet appareil n&apos;avaient pas été envoyées ({relativeTime(Math.floor(backup.ts / 1000))}).</span>
      <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <Btn size="small" variant="primary" onClick={onRestore}>Restaurer</Btn>
        <Btn size="small" variant="ghost" onClick={onDiscard}>Ignorer</Btn>
      </span>
    </div>
  );
}

function excerpt(v) {
  if (Array.isArray(v)) return v.map((t) => (typeof t === 'string' ? t : t.name || t.alias)).join(', ') || '∅';
  const s = v === null || v === undefined ? '' : String(v);
  return s.length > 600 ? `${s.slice(0, 600)}…` : (s || '∅');
}

export function ConflictDialog({ doc, conflict, onResolve }) {
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const resolve = async (choice) => { setBusy(true); try { await onResolve(choice); } finally { setBusy(false); } };
  return (
    <Dialog open title="⚠ Modifié ailleurs entre-temps" width={720} onClose={() => {}}
      footer={(
        <>
          <Btn variant="ghost" disabled={busy} onClick={() => resolve('theirs')}>Prendre l&apos;autre version</Btn>
          <Btn variant="primary" disabled={busy} onClick={() => resolve('mine')}>Garder ma version</Btn>
        </>
      )}>
      <p className="au-muted" style={{ marginBottom: 12 }}>
        Cette fiche a été enregistrée depuis un autre onglet ou appareil pendant que tu l&apos;éditais.
        Les champs ci-dessous ont changé des deux côtés — rien n&apos;a été écrasé.
        Si tu prends l&apos;autre version, tes textes longs sont d&apos;abord gardés dans l&apos;historique.
      </p>
      {conflict.keys.map((k) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <div className="au-field-label">{FIELD_LABELS[k] || k}</div>
          <div className="au-conflict">
            <div><div className="au-faint" style={{ fontSize: 11 }}>Ta version</div><pre>{excerpt(doc?.[k])}</pre></div>
            <div><div className="au-faint" style={{ fontSize: 11 }}>Version enregistrée ({formatDateTime(conflict.server.updatedAt)})</div><pre>{excerpt(conflict.server[k])}</pre></div>
          </div>
        </div>
      ))}
    </Dialog>
  );
}

// Historique d'un champ long (contenu d'un chapitre, corps d'une fiche).
export function RevisionsDialog({ open, onClose, entity, field, current, onRestored }) {
  const { pid, P, resolve } = useAuthor();
  const confirm = useConfirm();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [rev, setRev] = useState(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(() => P.revisions.list(entity.id, field).then((l) => { setList(l); if (l[0]) setSel(l[0].id); }).catch(setError), [P, entity.id, field]);
  useEffect(() => { if (open) { setList(null); setSel(null); setRev(null); load(); } }, [open, load]);
  useEffect(() => {
    if (!sel) { setRev(null); return; }
    let alive = true;
    P.revisions.get(entity.id, sel).then((r) => { if (alive) setRev(r); }).catch(setError);
    return () => { alive = false; };
  }, [P, entity.id, sel]);

  const snapshot = async () => {
    try {
      await P.revisions.create(entity.id, { field, label: label.trim() || 'Snapshot manuel', body: current });
      setLabel('');
      toast.success('Version enregistrée dans l\'historique');
      load();
    } catch (err) { setError(err); }
  };

  const restore = async () => {
    if (!rev) return;
    const ok = await confirm({
      title: 'Restaurer cette version ?',
      message: 'Le texte actuel sera d\'abord gardé dans l\'historique (« Avant restauration »), rien n\'est perdu.',
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    try {
      const updated = await P.revisions.restore(entity.id, rev.id);
      toast.success('Version restaurée');
      onRestored?.(updated);
      onClose();
    } catch (err) { toast.error(humanError(err)); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`🕘 Historique — ${entity.title}`} width={980}>
      <ErrorLine error={error} onClose={() => setError(null)} />
      <div className="au-toolbar">
        <input className="au-input au-grow" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom du snapshot (ex. « avant réécriture de la fin »)" />
        <Btn onClick={snapshot}>📌 Enregistrer la version actuelle</Btn>
      </div>
      <div className="au-revs">
        <div className="au-revs-list">
          {list === null && <p className="au-muted">Chargement…</p>}
          {list?.length === 0 && <p className="au-muted" style={{ fontSize: 13 }}>Aucune version pour l&apos;instant. Les versions automatiques se créent pendant l&apos;écriture (toutes les 10 min, et avant toute grosse suppression).</p>}
          {list?.map((r) => (
            <button key={r.id} type="button" className={cx('au-rev', sel === r.id && 'is-active')} onClick={() => setSel(r.id)}>
              <span style={{ fontWeight: 600 }}>{r.label || (r.manual ? 'Snapshot' : 'Automatique')}</span>
              <span className="au-faint" style={{ fontSize: 11.5 }}>{formatDateTime(r.createdAt)} · {r.wordCount} mots</span>
            </button>
          ))}
        </div>
        <div className="au-revs-preview">
          {rev ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <strong>{rev.label || (rev.manual ? 'Snapshot' : 'Version automatique')}</strong>
                <span className="au-faint" style={{ fontSize: 12 }}>{formatDateTime(rev.createdAt)} · {rev.wordCount} mots</span>
                <Btn variant="primary" size="small" style={{ marginLeft: 'auto' }} onClick={restore}>Restaurer cette version</Btn>
              </div>
              <div className="au-revs-text"><Markdown content={rev.body} pid={pid} resolve={resolve} /></div>
            </>
          ) : <p className="au-muted">Choisis une version.</p>}
        </div>
      </div>
      <p className="au-faint" style={{ fontSize: 11.5, marginTop: 10 }}>{kindMeta(entity.kind).label} · champ « {FIELD_LABELS[field] || field} »</p>
    </Dialog>
  );
}
