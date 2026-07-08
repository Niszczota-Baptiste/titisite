import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { Comments } from './Comments';
import { Button, Empty, ErrorBanner, Modal, Section, card, muted, relativeDate } from './shared';

// « 💬 Discussions & RP » : les fils du projet — le RP (lore, journal) et les
// discussions d'équipe, chacun avec ses commentaires. Réutilise le composant
// Comments (targetType 'thread').

const KINDS = [
  { id: 'rp',         label: '📖 RP / Lore',   color: '#c084fc' },
  { id: 'discussion', label: '💬 Discussion',  color: '#7bd3e8' },
];
const kindMeta = (k) => KINDS.find((x) => x.id === k) || KINDS[1];

export function DiscussionsTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);   // fil ouvert (détail)
  const [editing, setEditing] = useState(null);  // thread | 'new' | null
  const [filter, setFilter] = useState('all');   // 'all' | 'rp' | 'discussion'

  const load = () => {
    setLoading(true);
    ws.minecraft.threads.list()
      .then(setThreads)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const openThread = threads.find((t) => t.id === openId) || null;

  const remove = async (t) => {
    const ok = await confirm({
      title: `Supprimer « ${t.title} »`, danger: true, confirmLabel: 'Supprimer',
      message: 'Le fil et tous ses commentaires seront supprimés.',
    });
    if (!ok) return;
    try {
      await ws.minecraft.threads.remove(t.id);
      setThreads((prev) => prev.filter((x) => x.id !== t.id));
      if (openId === t.id) setOpenId(null);
      toast.success('Fil supprimé');
    } catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  const togglePin = async (t) => {
    try {
      const saved = await ws.minecraft.threads.update(t.id, { pinned: !t.pinned });
      setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, pinned: saved.pinned } : x)));
    } catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  // ── Vue détail d'un fil ──────────────────────────────────────────────────
  if (openThread) {
    const meta = kindMeta(openThread.kind);
    const canEdit = openThread.createdBy === user?.id || isAdmin;
    return (
      <Section title="💬 Discussions & RP" actions={<Button variant="ghost" onClick={() => setOpenId(null)}>← Retour</Button>}>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
              background: `${meta.color}22`, border: `1px solid ${meta.color}`, color: meta.color,
              fontFamily: "'Inter',sans-serif",
            }}>{meta.label}</span>
            {openThread.pinned && <span style={{ ...muted, fontSize: 11.5 }}>📌 épinglé</span>}
            <span style={{ ...muted, fontSize: 11.5, marginLeft: 'auto' }}>
              {openThread.createdByName ? `par ${openThread.createdByName} · ` : ''}{relativeDate(openThread.createdAt)}
            </span>
            {canEdit && (
              <>
                <button type="button" onClick={() => setEditing(openThread)} title="Modifier" style={miniBtn}>✏️</button>
                <button type="button" onClick={() => remove(openThread)} title="Supprimer" style={{ ...miniBtn, color: '#f87171', borderColor: 'rgba(200,50,50,0.25)', background: 'rgba(200,50,50,0.1)' }}>🗑️</button>
              </>
            )}
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#ede8f8', margin: '0 0 12px' }}>
            {openThread.title}
          </h2>
          {openThread.body && (
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 14.5, lineHeight: 1.7, color: 'rgba(224,216,240,0.92)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 20px',
            }}>{openThread.body}</p>
          )}
          <div style={{ borderTop: '1px solid rgba(80,50,130,0.2)', paddingTop: 16 }}>
            <div style={{ ...muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              💬 Commentaires
            </div>
            <Comments targetType="thread" targetId={openThread.id} />
          </div>
        </div>

        {editing && (
          <ThreadModal
            thread={editing === 'new' ? null : editing} ws={ws} toast={toast}
            onClose={() => setEditing(null)}
            onSaved={(saved) => { setEditing(null); setThreads((prev) => prev.map((x) => (x.id === saved.id ? { ...x, ...saved } : x))); }}
          />
        )}
      </Section>
    );
  }

  // ── Liste des fils ───────────────────────────────────────────────────────
  const shown = filter === 'all' ? threads : threads.filter((t) => t.kind === filter);

  return (
    <Section title="💬 Discussions & RP" actions={<Button onClick={() => setEditing('new')}>+ Nouveau fil</Button>}>
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />
      <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        Le RP du projet (lore, journal) et les discussions d'équipe — chaque fil
        a ses commentaires.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['all', 'Tous'], ...KINDS.map((k) => [k.id, k.label])].map(([id, label]) => {
          const active = filter === id;
          return (
            <button key={id} type="button" onClick={() => setFilter(id)}
              style={{
                padding: '5px 12px', borderRadius: 12, cursor: 'pointer',
                background: active ? 'rgba(201,168,232,0.16)' : 'rgba(20,12,40,0.5)',
                border: `1px solid ${active ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
                color: active ? '#c9a8e8' : 'rgba(180,170,200,0.7)',
                fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: active ? 600 : 400,
              }}
            >{label}</button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : shown.length === 0 ? (
        <Empty>Aucun fil. Ouvre le RP du projet ou lance une discussion avec « + Nouveau fil ».</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map((t) => {
            const meta = kindMeta(t.kind);
            return (
              <button key={t.id} type="button" onClick={() => setOpenId(t.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer', ...card, padding: '12px 14px',
                  borderLeft: `3px solid ${meta.color}`, display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {t.pinned && <span title="Épinglé">📌</span>}
                    <strong style={{ color: '#ede8f8', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15 }}>{t.title}</strong>
                    <span style={{ fontSize: 10.5, color: meta.color, fontFamily: "'Inter',sans-serif" }}>{meta.label}</span>
                  </div>
                  {t.body && (
                    <div style={{ ...muted, fontSize: 12.5, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.body.split('\n')[0]}
                    </div>
                  )}
                  <div style={{ ...muted, fontSize: 11, marginTop: 3 }}>
                    {t.createdByName ? `par ${t.createdByName} · ` : ''}{relativeDate(t.updatedAt)}
                    {t.commentCount > 0 && ` · 💬 ${t.commentCount}`}
                  </div>
                </div>
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); togglePin(t); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); togglePin(t); } }}
                  title={t.pinned ? 'Désépingler' : 'Épingler'}
                  style={{ ...miniBtn, opacity: t.pinned ? 1 : 0.5, flexShrink: 0 }}
                >📌</span>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <ThreadModal
          thread={editing === 'new' ? null : editing} ws={ws} toast={toast}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); load(); if (editing === 'new') setOpenId(saved.id); }}
        />
      )}
    </Section>
  );
}

// Modal de création / édition d'un fil (titre, type RP/discussion, corps).
function ThreadModal({ thread, ws, toast, onClose, onSaved }) {
  const [title, setTitle] = useState(thread?.title || '');
  const [kind, setKind] = useState(thread?.kind || 'discussion');
  const [body, setBody] = useState(thread?.body || '');
  const [pinned, setPinned] = useState(thread?.pinned || false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!title.trim()) { setErr('Donne un titre au fil.'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { title: title.trim(), kind, body: body.trim(), pinned };
      const saved = thread
        ? await ws.minecraft.threads.update(thread.id, payload)
        : await ws.minecraft.threads.create(payload);
      toast.success(thread ? 'Fil mis à jour' : 'Fil créé');
      onSaved(saved);
    } catch (e) { setErr(e.message || 'Enregistrement impossible'); setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={thread ? 'Modifier le fil' : 'Nouveau fil'} width={640}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && <p style={{ color: '#ff8a9b', fontSize: 12.5, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre du fil"
            style={{ ...inp, flex: '1 1 240px' }} autoFocus />
          <div style={{ display: 'flex', gap: 6 }}>
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)}
                style={{
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: kind === k.id ? `${k.color}22` : 'rgba(20,12,40,0.6)',
                  border: `1px solid ${kind === k.id ? k.color : 'rgba(80,50,130,0.3)'}`,
                  color: kind === k.id ? k.color : 'rgba(180,170,200,0.7)',
                  fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: kind === k.id ? 600 : 400,
                }}
              >{k.label}</button>
            ))}
          </div>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={kind === 'rp' ? 10 : 4}
          placeholder={kind === 'rp' ? 'Le RP / lore du projet — écris librement…' : 'De quoi veux-tu parler ?'}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ede8f8', fontFamily: "'Inter',sans-serif", cursor: 'pointer' }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ accentColor: '#c9a8e8' }} />
          📌 Épingler en haut
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving || !title.trim()}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </form>
    </Modal>
  );
}

const miniBtn = {
  background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
  color: '#ede8f8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 13,
};
const inp = {
  boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '9px 11px',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
};
