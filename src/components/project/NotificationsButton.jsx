import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../ui/ToastProvider';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Modal, muted,
} from './shared';

const OPTIONS = [
  { value: 'off',    label: 'Désactivé',                hint: 'Aucun email.' },
  { value: 'daily',  label: 'Tous les jours',           hint: 'Récap quotidien des activités sur tes projets.' },
  { value: 'weekly', label: 'Toutes les semaines',      hint: 'Récap hebdomadaire — moins de bruit.' },
];

export function NotificationsButton({ style, compact = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Préférences de notifications"
        style={{
          background: 'rgba(14,9,28,0.72)',
          border: `1px solid rgba(${ACC_RGB},0.35)`,
          color: ACC,
          borderRadius: 8,
          padding: compact ? '6px 12px' : '8px 14px',
          cursor: 'pointer',
          fontFamily: "'Inter',sans-serif",
          fontSize: compact ? 12 : 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          ...style,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${ACC_RGB},0.12)`)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(14,9,28,0.72)')}
      >
        📬 {compact ? 'Email' : 'Notifications email'}
      </button>
      <NotificationsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NotificationsModal({ open, onClose }) {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setErr(null);
    api.digestPrefs()
      .then(setInfo)
      .catch((e) => setErr(e.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [open]);

  const setFrequency = async (frequency) => {
    if (!info || saving || frequency === info.frequency) return;
    setSaving(true); setErr(null);
    try {
      const next = await api.setDigestPrefs(frequency);
      setInfo((prev) => ({ ...prev, ...next }));
      toast.success(
        frequency === 'off'
          ? 'Notifications désactivées'
          : `Tu recevras un récap ${frequency === 'daily' ? 'quotidien' : 'hebdomadaire'}.`,
      );
    } catch (e) {
      setErr(e.message || 'Erreur');
      toast.error(`Échec : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Notifications email" width={520}>
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      <p style={{ ...muted, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
        Reçois un email récapitulant les activités récentes (cartes,
        commentaires, réunions, documents, builds) sur tes projets. Tu peux
        changer la fréquence à tout moment.
      </p>

      {loading || !info ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <>
          {info.mailerConfigured === false && (
            <div style={{
              background: 'rgba(255,200,80,0.08)',
              border: '1px solid rgba(255,200,80,0.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 14,
              color: '#e8c878', fontSize: 12.5, lineHeight: 1.5,
            }}>
              ⚠ L'envoi d'emails n'est pas configuré sur ce serveur (SMTP_HOST manquant).
              Tes préférences sont enregistrées mais aucun email ne partira tant qu'un
              admin ne configure pas le SMTP.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OPTIONS.map((opt) => {
              const selected = info.frequency === opt.value;
              return (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: selected ? `rgba(${ACC_RGB},0.1)` : 'rgba(20,14,38,0.5)',
                    border: `1px solid ${selected ? `rgba(${ACC_RGB},0.5)` : 'rgba(60,40,100,0.25)'}`,
                    cursor: saving ? 'wait' : 'pointer',
                    transition: 'all 0.18s',
                  }}
                >
                  <input
                    type="radio"
                    name="digest-frequency"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setFrequency(opt.value)}
                    disabled={saving}
                    style={{
                      accentColor: ACC, marginTop: 3,
                      width: 16, height: 16, flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 14, fontWeight: 600,
                      color: selected ? ACC : '#ede8f8',
                    }}>{opt.label}</div>
                    <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{opt.hint}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {info.lastSentAt && (
            <p style={{ ...muted, fontSize: 11.5, marginTop: 14 }}>
              Dernier envoi : {new Date(info.lastSentAt * 1000).toLocaleString('fr-FR')}
            </p>
          )}
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <Button type="button" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  );
}
