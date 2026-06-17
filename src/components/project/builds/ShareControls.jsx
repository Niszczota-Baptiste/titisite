import { useState } from 'react';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { muted } from '../shared';

// Lien de partage en lecture seule (token) d'un build, pour les non-membres.
export function ShareControls({ ws, id, initialToken }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);

  const url = token ? `${window.location.origin}/build/${token}` : null;

  const create = async () => {
    setBusy(true);
    try { const { shareToken } = await ws.blueprints.share(id); setToken(shareToken); }
    catch { toast?.error?.('Partage impossible'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    const ok = await confirm({ title: 'Arrêter le partage', message: 'Le lien public cessera de fonctionner.', confirmLabel: 'Arrêter', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await ws.blueprints.unshare(id); setToken(null); }
    catch { toast?.error?.('Action impossible'); }
    finally { setBusy(false); }
  };
  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => toast?.success?.('Lien copié')).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 14px 14px' }}>
      {!token ? (
        <button type="button" onClick={create} disabled={busy} style={btn}>🔗 Créer un lien de partage (lecture seule)</button>
      ) : (
        <>
          <span style={{ ...muted, fontSize: 12 }}>Lien public :</span>
          <input readOnly value={url} onFocus={(e) => e.target.select()}
            style={{ flex: 1, minWidth: 180, background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '6px 10px', color: '#ede8f8', fontSize: 12 }} />
          <button type="button" onClick={copy} style={btn}>Copier</button>
          <button type="button" onClick={stop} disabled={busy} style={{ ...btn, color: '#f87171', borderColor: 'rgba(220,60,60,0.3)' }}>Arrêter</button>
        </>
      )}
    </div>
  );
}

const btn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
  background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif",
};
