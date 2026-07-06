import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../project/shared';
import { Button } from '../admin/ui';
import { ACC, ACC_RGB, GOLD, INK, MUTED } from './theme';

// Settings for the Minefield cockpit PULL feed: the secret per-user URL the
// Python app polls, a rotate button, and the reminder opt-in.
export function CockpitPanel({ open, onClose }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    api.cockpitInfo().then(setInfo).catch((e) => setErr(e.message || 'Erreur'));
  }, [open]);

  const rotate = async () => {
    setBusy(true); setErr(null);
    try { setInfo(await api.rotateCockpit()); }
    catch (e) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const toggleReminders = async (enabled) => {
    setBusy(true); setErr(null);
    try {
      const out = await api.setQuestReminders(enabled);
      setInfo((p) => ({ ...p, wantsReminders: out.wantsReminders }));
    } catch (e) { setErr(e.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const copy = () => {
    if (!info?.feedUrl) return;
    navigator.clipboard?.writeText(info.feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Cockpit Minefield" width={560}>
      {err && <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err}</p>}
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, lineHeight: 1.55, marginTop: 0 }}>
        Ton app cockpit (sur ton PC) interroge cette URL secrète pour afficher les rappels : quêtes
        récurrentes redevenues disponibles, échéances proches et gains potentiels. Ne la partage pas.
      </p>

      {!info ? (
        <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <>
          <label style={labelStyle}>URL du flux (à coller dans le cockpit)</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              readOnly
              value={info.feedUrl}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1, background: 'rgba(14,8,32,0.72)', border: `1px solid rgba(${ACC_RGB},0.3)`,
                borderRadius: 8, padding: '9px 11px', color: INK,
                fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none',
              }}
            />
            <Button type="button" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</Button>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            cursor: busy ? 'wait' : 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: INK,
          }}>
            <input
              type="checkbox"
              checked={!!info.wantsReminders}
              disabled={busy}
              onChange={(e) => toggleReminders(e.target.checked)}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Recevoir les <strong>rappels</strong> dans le cockpit
              <span style={{ color: MUTED, fontSize: 11.5, marginLeft: 6 }}>
                (décoché : le flux ne renvoie que les gains, sans liste d'actions)
              </span>
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: GOLD, fontFamily: "'Inter',sans-serif" }}>
              En cas de fuite, régénère le jeton — l'ancienne URL cesse de fonctionner.
            </span>
            <Button type="button" variant="ghost" onClick={rotate} disabled={busy}>Régénérer le jeton</Button>
          </div>

          <p style={{ margin: '16px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED }}>
            ⚙️ Items perso, quêtes suivies et aperçu du flux :{' '}
            <a href="/admin" style={{ color: ACC, textDecoration: 'none', fontWeight: 600 }}>
              page « Cockpit » →
            </a>
          </p>
        </>
      )}
    </Modal>
  );
}

const labelStyle = {
  display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 11, color: MUTED,
  letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600,
};
