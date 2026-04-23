import { useEffect, useState } from 'react';
import { api, triggerDownload, uploadFile } from '../../api/client';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Field, Input, Modal, Section, Textarea,
  Empty, card, formatBytes, formatDate, muted,
} from './shared';
import { Comments } from './Comments';
import { FileDrop, ProgressBar } from './FileDrop';

export function DocumentsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [active, setActive] = useState(null); // document being viewed (comments)
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      setItems(await api.get('/documents'));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try { await api.del(`/documents/${id}`); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Section
      title="Documents"
      actions={<Button onClick={() => setUploadOpen(true)}>+ Téléverser</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucun document. Téléversez votre premier fichier de conception.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((d) => (
            <div key={d.id} style={{
              ...card,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: `rgba(${ACC_RGB},0.1)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ACC, fontSize: 18,
              }}>
                📄
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
                    color: '#ede8f8',
                  }}>{d.title}</span>
                  <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace' }}>
                    {d.originalName}
                  </span>
                </div>
                <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>
                  {formatBytes(d.size)} · déposé par {d.uploadedByName || 'inconnu'} · {formatDate(d.createdAt)}
                </div>
                {d.notes && (
                  <p style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                    color: 'rgba(200,192,216,0.8)', marginTop: 6,
                    whiteSpace: 'pre-wrap',
                  }}>{d.notes}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={() => setActive(d)}>Notes</Button>
                <Button
                  variant="ghost"
                  onClick={() => triggerDownload('documents', d.id, d.originalName).catch((e) => setErr(e.message))}
                >
                  ↓
                </Button>
                <Button variant="danger" onClick={() => remove(d.id)}>Suppr.</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { setUploadOpen(false); load(); }}
      />

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? `Notes · ${active.title}` : ''}
      >
        {active && (
          <>
            <DocumentMeta doc={active} />
            <Comments targetType="document" targetId={active.id} />
          </>
        )}
      </Modal>
    </Section>
  );
}

function DocumentMeta({ doc }) {
  return (
    <div style={{
      background: 'rgba(4,3,14,0.45)', borderRadius: 8, padding: 12,
      marginBottom: 16, fontSize: 12, ...muted,
    }}>
      <div>Fichier : <span style={{ color: '#ede8f8', fontFamily: 'monospace' }}>{doc.originalName}</span></div>
      <div>Taille : {formatBytes(doc.size)}</div>
      <div>Déposé : {formatDate(doc.createdAt)} par {doc.uploadedByName || '—'}</div>
      {doc.notes && <div style={{ marginTop: 8, color: 'rgba(200,192,216,0.85)' }}>{doc.notes}</div>}
    </div>
  );
}

function UploadModal({ open, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) {
      setFile(null); setTitle(''); setNotes(''); setProgress(0); setErr(null);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      if (notes) fd.append('notes', notes);
      await uploadFile('/documents', fd, { onProgress: setProgress });
      onUploaded();
    } catch (ex) {
      if (ex.status === 413 || ex.body?.error === 'file_too_large') {
        setErr('Fichier trop volumineux (> 1 Go). Utilisez un lien externe via un build.');
      } else {
        setErr(ex.message);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Téléverser un document">
      <form onSubmit={submit}>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />
        <Field label="Fichier">
          <FileDrop value={file} onChange={(f) => { setFile(f); if (!title && f) setTitle(f.name); }} />
          {uploading && <ProgressBar value={progress} />}
        </Field>
        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du document" />
        </Field>
        <Field label="Notes (optionnel)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={uploading}>Annuler</Button>
          <Button type="submit" disabled={!file || uploading}>
            {uploading ? `${Math.round(progress * 100)} %` : 'Téléverser'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
