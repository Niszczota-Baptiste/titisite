import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Field, Input, Modal, muted,
} from './shared';

export function CalendarExportButton({ style, compact = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
        📆 {compact ? 'Exporter' : 'Exporter mon calendrier'}
      </button>
      <CalendarExportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CalendarExportModal({ open, onClose }) {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.icalToken()
      .then(setInfo)
      .catch((e) => setErr(e.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [open]);

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setErr("Impossible de copier — utilise un long-press sur le lien.");
    }
  };

  const rotate = async () => {
    if (!window.confirm(
      "Générer une nouvelle URL ? L'ancien abonnement cessera de fonctionner et tu devras reconfigurer ton calendrier.",
    )) return;
    setRotating(true); setErr(null);
    try {
      const next = await api.rotateIcalToken();
      setInfo(next);
    } catch (e) {
      setErr(e.message || 'Erreur');
    } finally {
      setRotating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Exporter sur ton calendrier" width={640}>
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      <p style={{ ...muted, fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
        Abonne-toi à cette URL depuis ton app calendrier : réunions et cartes
        avec échéance apparaîtront automatiquement et se mettront à jour
        (synchronisation toutes les ~5 min selon l'app).
      </p>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : info ? (
        <>
          <Field label="URL d'abonnement (webcal, recommandée sur mobile)">
            <CopyRow
              value={info.webcalUrl}
              copied={copied === 'webcal'}
              onCopy={() => copy('webcal', info.webcalUrl)}
              openAs={info.webcalUrl}
            />
          </Field>

          <Field label="URL HTTPS / HTTP (si ton app refuse webcal)">
            <CopyRow
              value={info.httpUrl}
              copied={copied === 'http'}
              onCopy={() => copy('http', info.httpUrl)}
            />
          </Field>

          <div style={{
            marginTop: 18, padding: 14,
            background: 'rgba(4,3,14,0.45)',
            border: '1px solid rgba(60,40,100,0.22)',
            borderRadius: 8,
          }}>
            <div style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700,
              color: 'rgba(180,170,200,0.6)', letterSpacing: '1px',
              textTransform: 'uppercase', marginBottom: 8,
            }}>
              Mode d'emploi
            </div>
            <ul style={{ ...muted, fontSize: 12.5, lineHeight: 1.8, paddingLeft: 18 }}>
              <li><b style={{ color: '#ede8f8' }}>iPhone / iPad</b> — Ouvre l'URL « webcal » sur le téléphone ; iOS propose d'ajouter le calendrier automatiquement.</li>
              <li><b style={{ color: '#ede8f8' }}>Google Calendar</b> — <i>Paramètres → Ajouter un agenda → À partir d'une URL</i> et colle l'URL HTTPS.</li>
              <li><b style={{ color: '#ede8f8' }}>Outlook</b> — <i>Ajouter un calendrier → S'abonner à partir du web</i> et colle l'URL HTTPS.</li>
            </ul>
          </div>

          <div style={{
            display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap',
          }}>
            <a
              href={info.downloadUrl}
              download
              style={{
                background: ACC,
                color: '#08051a',
                textDecoration: 'none',
                borderRadius: 8,
                padding: '9px 16px',
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 13, fontWeight: 700,
              }}
            >
              ↓ Télécharger le .ics (one-shot)
            </a>
            <Button type="button" variant="ghost" onClick={rotate} disabled={rotating}>
              {rotating ? '…' : 'Régénérer l\'URL'}
            </Button>
          </div>

          <p style={{
            marginTop: 14, fontSize: 11, color: 'rgba(180,170,200,0.45)',
            fontFamily: "'Inter',sans-serif",
          }}>
            L'URL est personnelle à {user?.name || user?.email}. Ne la partage pas :
            elle permet de lire tes réunions et échéances (pas de modification).
          </p>
        </>
      ) : null}
    </Modal>
  );
}

function CopyRow({ value, copied, onCopy, openAs }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        style={{ fontFamily: 'monospace', fontSize: 12 }}
      />
      {openAs && (
        <a
          href={openAs}
          style={{
            background: 'rgba(20,14,38,0.6)',
            border: '1px solid rgba(80,50,130,0.28)',
            color: 'rgba(232,228,248,0.85)',
            borderRadius: 8, padding: '8px 12px',
            textDecoration: 'none', fontSize: 13,
            fontFamily: "'Inter',sans-serif",
            whiteSpace: 'nowrap',
          }}
          title="Ouvrir (propose l'abonnement sur mobile)"
        >
          Ouvrir
        </a>
      )}
      <button
        type="button"
        onClick={onCopy}
        style={{
          background: copied ? `rgba(${ACC_RGB},0.24)` : 'rgba(20,14,38,0.6)',
          border: `1px solid ${copied ? ACC : 'rgba(80,50,130,0.28)'}`,
          color: copied ? ACC : 'rgba(232,228,248,0.85)',
          borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
          fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {copied ? '✓ Copié' : 'Copier'}
      </button>
    </div>
  );
}
