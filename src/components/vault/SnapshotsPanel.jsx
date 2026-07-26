import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { formatDate } from '../project/shared';
import { GOLD, INK, MUTED, body, mono, panel, title } from './theme';

// Versionnage : un snapshot fige le plan (document, gabarit, catégories
// utilisées). Le restaurer crée un NOUVEAU plan — l'original n'est jamais
// écrasé, c'est tout l'intérêt avant une MàJ Minecraft.

export function SnapshotsPanel({ planId, onRestored }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.vault.snapshots.list(planId).then(setItems).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [planId]);

  const create = async () => {
    const label = window.prompt('Nom du snapshot ?', `v${new Date().toISOString().slice(0, 10)}`);
    if (!label?.trim()) return;
    setBusy(true);
    try {
      await api.vault.snapshots.create(planId, label.trim());
      await load();
      toast.success('Snapshot créé');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const restore = async (snap) => {
    const ok = await confirm({
      title: `Restaurer « ${snap.label} » ?`,
      message: 'Le snapshot est dupliqué dans un nouveau plan. Le plan courant reste intact.',
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const plan = await api.vault.snapshots.restore(planId, snap.id);
      toast.success(`« ${plan.name} » créé`);
      onRestored?.(plan);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...panel, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ ...title, fontSize: 13 }}>Snapshots</h3>
        <button type="button" onClick={create} disabled={busy} style={smallBtn}>+ Figer l’état</button>
      </div>
      {items.length === 0 && (
        <p style={{ ...body, fontSize: 11.5, color: MUTED, margin: 0 }}>
          Aucun snapshot. Fige l’état avant une MàJ Minecraft pour pouvoir y revenir.
        </p>
      )}
      {items.map((s) => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8,
          background: 'rgba(20,14,38,0.55)', border: '1px solid rgba(80,50,130,0.25)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...body, fontSize: 12, fontWeight: 600, color: INK }}>{s.label}</div>
            <div style={{ ...mono, fontSize: 10, color: MUTED }}>
              {formatDate(s.createdAt)} · {s.stats.chests} coffres · {s.stats.slots} slots
              {s.createdByName ? ` · ${s.createdByName}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => restore(s)} disabled={busy} style={smallBtn}>Restaurer</button>
        </div>
      ))}
    </div>
  );
}

export function SharePanel({ planId, sharedWith, isOwner, onChanged }) {
  const toast = useToast();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [pick, setPick] = useState('');

  useEffect(() => {
    if (!isOwner) return;
    api.users().then(setUsers).catch(() => {});
  }, [isOwner]);

  const share = async () => {
    if (!pick) return;
    try {
      const r = await api.vault.share(planId, Number(pick));
      onChanged(r.sharedWith);
      setPick('');
      toast.success('Plan partagé');
    } catch (e) { toast.error(e.message === 'cannot_share_with_self' ? 'C’est déjà ton plan.' : e.message); }
  };

  const unshare = async (userId) => {
    try {
      const r = await api.vault.unshare(planId, userId);
      onChanged(r.sharedWith);
    } catch (e) { toast.error(e.message); }
  };

  // Ni soi-même (le serveur refuserait), ni les comptes déjà destinataires.
  const already = new Set([...sharedWith.map((s) => s.id), user?.id]);

  return (
    <div style={{ ...panel, display: 'grid', gap: 8 }}>
      <h3 style={{ ...title, fontSize: 13 }}>Partage</h3>
      {sharedWith.length === 0 && (
        <p style={{ ...body, fontSize: 11.5, color: MUTED, margin: 0 }}>
          Plan personnel. {isOwner ? 'Partage-le pour éditer à deux.' : ''}
        </p>
      )}
      {sharedWith.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...body, fontSize: 12, color: INK, flex: 1 }}>
            {s.name}
            {!s.canViewVault && (
              <span style={{ color: '#e8c86a', fontSize: 10.5 }}> · accès atelier désactivé</span>
            )}
          </span>
          {isOwner && (
            <button type="button" onClick={() => unshare(s.id)} style={dangerBtn}>Retirer</button>
          )}
        </div>
      ))}
      {isOwner && (
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={select}>
            <option value="">Ajouter un compte…</option>
            {users.filter((u) => !already.has(u.id)).map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email || `Compte #${u.id}`}</option>
            ))}
          </select>
          <button type="button" onClick={share} disabled={!pick} style={smallBtn}>Partager</button>
        </div>
      )}
    </div>
  );
}

const smallBtn = {
  padding: '4px 9px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: GOLD,
  whiteSpace: 'nowrap',
};

const dangerBtn = {
  padding: '3px 8px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 10.5,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

const select = {
  flex: 1, padding: '6px 8px', borderRadius: 7, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};
