import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../../api/client';
import { ACC, ACC_RGB, Button, formatBytes, muted } from './shared';

/**
 * Edit-mode attachment picker scoped to a workspace.
 */
export function AttachmentsEditor({ value = [], onChange, workspaceSlug }) {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!workspaceSlug) { setDocs([]); return; }
    api.ws(workspaceSlug).documents.list().then(setDocs).catch(() => setDocs([]));
  }, [workspaceSlug]);

  const selected = (docs || []).filter((d) => value.includes(d.id));
  const available = (docs || []).filter((d) => !value.includes(d.id));

  return (
    <div>
      {selected.length === 0 ? (
        <p style={{ ...muted, fontSize: 12, marginBottom: 8 }}>
          Aucun fichier lié.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {selected.map((d) => (
            <AttachmentRow
              key={d.id}
              doc={d}
              workspaceSlug={workspaceSlug}
              kind="documents"
              onRemove={() => onChange(value.filter((id) => id !== d.id))}
            />
          ))}
        </div>
      )}

      {!open ? (
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          + Lier un document
        </Button>
      ) : (
        <div style={{
          border: '1px solid rgba(80,50,130,0.28)',
          background: 'rgba(4,3,14,0.45)',
          borderRadius: 8, padding: 10, marginTop: 4,
          maxHeight: 220, overflow: 'auto',
        }}>
          {docs === null ? (
            <p style={{ ...muted, fontSize: 12 }}>Chargement…</p>
          ) : available.length === 0 ? (
            <p style={{ ...muted, fontSize: 12 }}>
              Aucun autre document disponible dans ce projet. Téléverse-le depuis l'onglet « Documents ».
            </p>
          ) : (
            available.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { onChange([...value, d.id]); setOpen(false); }}
                style={{
                  display: 'flex', width: '100%', gap: 10, alignItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px 10px', borderRadius: 6,
                  color: '#ede8f8', textAlign: 'left',
                  fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${ACC_RGB},0.08)`)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title}
                </span>
                <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace' }}>
                  {formatBytes(d.size)}
                </span>
              </button>
            ))
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} style={{ fontSize: 11 }}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttachmentRow({ doc, workspaceSlug, kind = 'documents', onRemove, onError }) {
  const open = (e) => {
    e.preventDefault();
    if (!workspaceSlug) return;
    const url = api.ws(workspaceSlug)[kind].downloadUrl(doc.id);
    triggerDownload(url, doc.originalName).catch((err) => onError?.(err.message));
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center',
      padding: '7px 10px',
      background: 'rgba(4,3,14,0.45)',
      border: '1px solid rgba(60,40,100,0.2)',
      borderRadius: 8,
      fontSize: 12.5, fontFamily: "'Inter',sans-serif",
    }}>
      <span style={{ fontSize: 14 }}>📄</span>
      <button
        type="button"
        onClick={open}
        title={doc.originalName}
        style={{
          flex: 1, minWidth: 0, background: 'none', border: 'none',
          color: ACC, cursor: 'pointer', textAlign: 'left',
          padding: 0, fontFamily: "'Inter',sans-serif", fontSize: 12.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {doc.title}
      </button>
      <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
        {formatBytes(doc.size)}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', color: 'rgba(180,170,200,0.4)',
            cursor: 'pointer', fontSize: 14, padding: '0 4px',
          }}
          title="Retirer"
        >×</button>
      )}
    </div>
  );
}

export function AttachmentList({ documents, workspaceSlug, onError }) {
  if (!documents || documents.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {documents.map((d) => (
        <AttachmentRow key={d.id} doc={d} workspaceSlug={workspaceSlug} onError={onError} />
      ))}
    </div>
  );
}
