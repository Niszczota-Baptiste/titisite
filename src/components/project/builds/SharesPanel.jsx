import { useEffect, useState } from 'react';
import { Button, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useConfirm } from '../../../ui/ConfirmProvider';

// Gestion des liens de partage scopés (view / edit) — propriétaire uniquement.
// Le lien `view` montre le build (lecture/aperçu) ; `edit` autorise les
// transformations et l'export. Expiration + révocation.
export function SharesPanel({ ws, id }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [shares, setShares] = useState(null); // null = inconnu, [] = aucun, undefined = pas propriétaire
  const [scope, setScope] = useState('view');
  const [days, setDays] = useState(7);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => ws.blueprints.shares.list(id)
    .then(setShares)
    .catch((e) => setShares(e?.status === 403 ? undefined : []));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ws, id]);

  if (shares === undefined) return null; // non propriétaire → pas de gestion d'accès

  const create = async () => {
    setBusy(true);
    try {
      await ws.blueprints.shares.create(id, { scope, expiresInDays: Number(days) || undefined, label: label.trim() });
      setLabel('');
      toast?.success?.('Lien créé');
      await load();
    } catch { toast?.error?.('Création impossible'); }
    finally { setBusy(false); }
  };

  const revoke = async (s) => {
    const ok = await confirm({ title: 'Révoquer le lien', message: 'Ce lien cessera immédiatement de fonctionner.', confirmLabel: 'Révoquer', danger: true });
    if (!ok) return;
    try { await ws.blueprints.shares.revoke(id, s.id); await load(); }
    catch { toast?.error?.('Action impossible'); }
  };

  const linkUrl = (s) => `${window.location.origin}/we/${s.token || ''}`;
  const copy = (s) => navigator.clipboard?.writeText(linkUrl(s)).then(() => toast?.success?.('Lien copié')).catch(() => {});

  return (
    <div style={{ padding: 14, borderTop: '1px solid rgba(80,50,130,0.22)' }}>
      <strong style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14 }}>🔑 Accès partagés</strong>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={sel}>
          <option value="view">Lecteur (view)</option>
          <option value="edit">Éditeur (edit)</option>
        </select>
        <Input type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 80 }} aria-label="Expiration (jours)" />
        <span style={{ ...muted, fontSize: 12 }}>jours (0 = sans expiration)</span>
        <Input placeholder="libellé (optionnel)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <Button onClick={create} disabled={busy}>Créer le lien</Button>
      </div>
      {scope === 'edit' && (
        <div style={{ ...muted, fontSize: 11, marginBottom: 8 }}>
          ⚠️ Un lien <code>edit</code> autorise la réécriture des fichiers de save : réserve-le à des personnes de confiance.
        </div>
      )}
      {Array.isArray(shares) && shares.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          {shares.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12,
              opacity: s.active ? 1 : 0.5, padding: '6px 8px', background: 'rgba(14,9,28,0.4)', borderRadius: 8 }}>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: s.scope === 'edit' ? 'rgba(255,140,90,0.18)' : 'rgba(120,180,255,0.16)', color: s.scope === 'edit' ? '#ffb38a' : '#9ecbff' }}>
                {s.scope === 'edit' ? 'edit' : 'view'}
              </span>
              {s.label && <span>{s.label}</span>}
              <span style={{ ...muted }}>
                {s.revokedAt ? 'révoqué' : s.expiresAt ? `expire le ${new Date(s.expiresAt * 1000).toLocaleDateString('fr')}` : 'sans expiration'}
              </span>
              <span style={{ flex: 1 }} />
              {s.active && s.token && <button type="button" onClick={() => copy(s)} style={miniBtn}>Copier</button>}
              {s.active && <button type="button" onClick={() => revoke(s)} style={{ ...miniBtn, color: '#f87171' }}>Révoquer</button>}
            </div>
          ))}
        </div>
      ) : <div style={{ ...muted, fontSize: 12 }}>Aucun lien actif.</div>}
    </div>
  );
}

const sel = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '7px 10px', color: '#ede8f8', fontSize: 13, fontFamily: "'Inter',sans-serif",
};
const miniBtn = {
  padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, background: 'transparent',
  border: '1px solid rgba(80,50,130,0.28)', color: '#ede8f8', fontFamily: "'Inter',sans-serif",
};
