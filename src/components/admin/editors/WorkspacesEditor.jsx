import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { EmojiPicker } from '../EmojiPicker';
import { TagsPopup } from '../TagsPopup';
import { ACC, ACC_RGB, Button, CheckboxField, Field, Input, Textarea } from '../ui';

function todayDateString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const COLOR_PALETTE = ['#c9a8e8', '#e8a87c', '#9ad4ae', '#80c8e8', '#e88cb8', '#e8d27c', '#8a60b0', '#ff8a9b'];

export function WorkspacesEditor() {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | workspace
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ws, us] = await Promise.all([api.workspaces.list(), api.users()]);
      setItems(ws); setUsers(us); setErr(null);
    } catch (e) { setErr(humanize(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (w) => {
    const ok = await confirm({
      title: `Supprimer « ${w.name} »`,
      message: 'Toutes ses données (cards, réunions, documents, builds) seront définitivement perdues.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try { await api.workspaces.remove(w.id); await load(); }
    catch (e) { setErr(humanize(e)); }
  };

  const toggleArchive = async (w) => {
    try {
      await api.workspaces.update(w.id, { status: w.status === 'archived' ? 'active' : 'archived' });
      await load();
    } catch (e) { setErr(humanize(e)); }
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>Projets d'équipe</h2>
        <Button onClick={() => setEditing('new')} disabled={editing !== null}>+ Ajouter</Button>
      </div>

      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 13,
        }}>{err}</div>
      )}

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {editing === 'new' && (
            <WorkspaceForm
              users={users}
              onSaved={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)}
            />
          )}
          {items.map((w) => (
            <div key={w.id}>
              {editing?.id === w.id ? (
                <WorkspaceForm
                  workspace={w}
                  users={users}
                  onSaved={() => { setEditing(null); load(); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <WorkspaceRow
                  w={w}
                  users={users}
                  onEdit={() => setEditing(w)}
                  onToggleArchive={() => toggleArchive(w)}
                  onDelete={() => remove(w)}
                />
              )}
            </div>
          ))}
          {items.length === 0 && editing === null && (
            <p style={{
              color: 'rgba(180,170,200,0.5)',
              fontFamily: "'Inter',sans-serif", fontSize: 13,
              padding: '20px 0', textAlign: 'center',
            }}>
              Aucun projet. Clique sur « Ajouter » pour en créer un.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function WorkspaceRow({ w, users, onEdit, onToggleArchive, onDelete }) {
  const memberNames = (w.memberIds || [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => u.name || u.email);

  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: `1px solid ${w.status === 'archived' ? 'rgba(60,40,100,0.15)' : 'rgba(80,50,130,0.24)'}`,
      borderRadius: 12, padding: 0, overflow: 'hidden',
      opacity: w.status === 'archived' ? 0.6 : 1,
    }}>
      <div style={{ height: 3, background: w.color }} />
      <div style={{
        padding: 16,
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <span style={{
          fontSize: 28, flexShrink: 0,
          filter: `drop-shadow(0 0 10px ${w.color}66)`,
        }}>{w.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
              color: '#ede8f8',
            }}>{w.name}</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 11, color: 'rgba(180,170,200,0.5)',
            }}>/{w.slug}</span>
            {w.status === 'archived' && (
              <span style={{
                fontSize: 10, color: 'rgba(180,170,200,0.6)',
                background: 'rgba(60,40,100,0.3)', padding: '1px 6px', borderRadius: 3,
                letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 700,
              }}>Archivé</span>
            )}
          </div>
          {w.description && (
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 12.5,
              color: 'rgba(200,192,216,0.7)', marginTop: 4,
            }}>{w.description}</p>
          )}
          <div style={{
            fontFamily: "'Inter',sans-serif", fontSize: 11.5,
            color: 'rgba(180,170,200,0.55)', marginTop: 6,
          }}>
            Membres : {memberNames.length === 0 ? 'aucun' : memberNames.join(', ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="ghost" onClick={onEdit}>Éditer</Button>
          <Button variant="ghost" onClick={onToggleArchive}>
            {w.status === 'archived' ? 'Restaurer' : 'Archiver'}
          </Button>
          <Button variant="danger" onClick={onDelete}>Supprimer</Button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceForm({ workspace, users, onSaved, onCancel }) {
  const isEdit = !!workspace;
  const [name, setName] = useState(workspace?.name || '');
  const [slug, setSlug] = useState(workspace?.slug || '');
  const [description, setDescription] = useState(workspace?.description || '');
  const [color, setColor] = useState(workspace?.color || COLOR_PALETTE[0]);
  const [icon, setIcon] = useState(workspace?.icon || '🎮');
  const [startDate, setStartDate] = useState(
    isEdit ? toDateInput(workspace?.startDate) : todayDateString(),
  );
  const [endDate, setEndDate] = useState(toDateInput(workspace?.endDate));
  const [tags, setTags] = useState(workspace?.tags || []);
  const [memberIds, setMemberIds] = useState(workspace?.memberIds || []);
  const [status, setStatus] = useState(workspace?.status || 'active');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Nom requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        name, slug: slug || undefined, description, color, icon,
        startDate: startDate || null,
        endDate: endDate || null,
        tags,
        status,
        memberIds,
      };
      if (isEdit) await api.workspaces.update(workspace.id, payload);
      else await api.workspaces.create(payload);
      onSaved();
    } catch (ex) { setErr(humanize(ex)); }
    finally { setSaving(false); }
  };

  const toggleMember = (id) => {
    setMemberIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <form
      onSubmit={submit}
      style={{
        background: 'rgba(14,9,28,0.72)',
        border: `1px solid rgba(${ACC_RGB},0.4)`,
        borderRadius: 12, padding: 18,
      }}
    >
      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#ff8a9b',
          fontSize: 12, fontFamily: "'Inter',sans-serif",
        }}>{err}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 10 }}>
        <Field label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Slug (auto si vide)">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="game-alpha" />
        </Field>
        <Field label="Icône">
          <EmojiPicker value={icon} onChange={setIcon} />
        </Field>
      </div>

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>

      <Field label="Couleur">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: c, cursor: 'pointer',
                border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                boxShadow: color === c ? `0 0 10px ${c}88` : 'none',
              }}
            />
          ))}
          <Input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 50, padding: 4, height: 32 }}
          />
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Date de début (optionnelle)">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Date de fin (optionnelle)">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Tags">
        <TagsPopup value={tags} onChange={setTags} />
      </Field>

      <Field label="Membres">
        <div style={{
          background: 'rgba(4,3,14,0.45)',
          border: '1px solid rgba(60,40,100,0.2)',
          borderRadius: 8, padding: 10,
          maxHeight: 180, overflow: 'auto',
        }}>
          {users.length === 0 ? (
            <p style={{ color: 'rgba(180,170,200,0.5)', fontSize: 12 }}>Aucun utilisateur.</p>
          ) : (
            users.map((u) => (
              <label
                key={u.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 4px', cursor: 'pointer',
                  fontFamily: "'Inter',sans-serif", fontSize: 13,
                  color: '#ede8f8',
                }}
              >
                <input
                  type="checkbox"
                  checked={memberIds.includes(u.id)}
                  onChange={() => toggleMember(u.id)}
                  style={{ accentColor: ACC, width: 15, height: 15 }}
                />
                <span>{u.name || u.email}</span>
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 3,
                  background: u.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                  color: u.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                }}>{u.role}</span>
              </label>
            ))
          )}
        </div>
      </Field>

      {isEdit && (
        <CheckboxField
          label="Archivé"
          value={status === 'archived'}
          onChange={(v) => setStatus(v ? 'archived' : 'active')}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : (isEdit ? 'Mettre à jour' : 'Créer')}</Button>
      </div>
    </form>
  );
}

function toDateInput(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MESSAGES = {
  missing_name:   'Nom requis.',
  invalid_body:   'Données invalides.',
  not_found:      'Projet introuvable.',
  forbidden:      "Tu n'as pas les droits pour cette action.",
};
function humanize(err) {
  const key = err?.body?.error || err?.message;
  return MESSAGES[key] || err?.message || 'Erreur inconnue.';
}
