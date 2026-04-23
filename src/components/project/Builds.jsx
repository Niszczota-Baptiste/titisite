import { useEffect, useState } from 'react';
import { api, triggerDownload, uploadFile } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Field, Input, Modal, Section, Textarea,
  Empty, card, formatBytes, formatDate, muted,
} from './shared';
import { FileDrop, ProgressBar } from './FileDrop';

const STATUSES = ['alpha', 'beta', 'release'];

export function BuildsTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await ws.builds.list()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const remove = async (id) => {
    if (!window.confirm('Supprimer ce build ?')) return;
    try { await ws.builds.remove(id); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Section
      title="Builds / MVPs"
      actions={<Button onClick={() => { setEditing(null); setModalOpen(true); }}>+ Nouveau build</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucun build. Ajoute-en un (fichier ≤ 1 Go ou lien externe).</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((b) => (
            <div key={b.id} style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <StatusBadge status={b.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 13, color: ACC,
                    background: `rgba(${ACC_RGB},0.1)`, padding: '2px 8px', borderRadius: 4,
                  }}>v{b.version}</span>
                  {b.title && (
                    <span style={{
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
                      color: '#ede8f8',
                    }}>{b.title}</span>
                  )}
                </div>
                <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>
                  {b.hasFile ? `${formatBytes(b.size)} · ${b.originalName}` : 'Lien externe'}
                  {' · '}déposé par {b.uploadedByName || '—'} · {formatDate(b.releasedAt)}
                </div>
                {b.notes && (
                  <p style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                    color: 'rgba(200,192,216,0.8)', marginTop: 6, whiteSpace: 'pre-wrap',
                  }}>{b.notes}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {b.hasFile && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      triggerDownload(ws.builds.downloadUrl(b.id), b.originalName)
                        .catch((e) => setErr(e.message))
                    }
                  >↓</Button>
                )}
                {b.externalUrl && (
                  <a
                    href={b.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: 'none',
                      color: 'rgba(232,228,248,0.75)',
                      border: '1px solid rgba(80,50,130,0.32)',
                      borderRadius: 8, padding: '8px 14px', fontSize: 13,
                      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
                    }}
                  >↗ Ouvrir</a>
                )}
                <Button variant="ghost" onClick={() => { setEditing(b); setModalOpen(true); }}>Éditer</Button>
                <Button variant="danger" onClick={() => remove(b.id)}>Suppr.</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BuildModal
        workspace={workspace}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        build={editing}
        onSaved={() => { setModalOpen(false); load(); }}
      />
    </Section>
  );
}

function StatusBadge({ status }) {
  const map = {
    alpha:   { color: '#e8a87c', bg: 'rgba(232,168,124,0.1)' },
    beta:    { color: ACC, bg: `rgba(${ACC_RGB},0.1)` },
    release: { color: '#9ad4ae', bg: 'rgba(154,212,174,0.1)' },
  };
  const s = map[status] || map.alpha;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 4,
      fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 700,
      letterSpacing: '1px', textTransform: 'uppercase',
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
      flexShrink: 0, marginTop: 2,
    }}>{status}</span>
  );
}

function BuildModal({ workspace, open, onClose, build, onSaved }) {
  const ws = api.ws(workspace.slug);
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('alpha');
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!build;

  useEffect(() => {
    if (!open) return;
    if (build) {
      setVersion(build.version || '');
      setTitle(build.title || '');
      setStatus(build.status || 'alpha');
      setMode(build.hasFile ? 'file' : 'url');
      setFile(null);
      setExternalUrl(build.externalUrl || '');
      setNotes(build.notes || '');
    } else {
      setVersion(''); setTitle(''); setStatus('alpha');
      setMode('file'); setFile(null); setExternalUrl(''); setNotes('');
    }
    setProgress(0); setErr(null);
  }, [open, build]);

  const submit = async (e) => {
    e.preventDefault();
    if (!version.trim()) { setErr('Version requise'); return; }
    if (!isEdit && mode === 'file' && !file) { setErr('Fichier requis'); return; }
    if (mode === 'url' && !externalUrl.trim()) { setErr('URL requise'); return; }

    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        await ws.builds.update(build.id, {
          version, title, status, notes,
          externalUrl: mode === 'url' ? externalUrl : build.externalUrl,
        });
      } else if (mode === 'file') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('version', version);
        fd.append('title', title);
        fd.append('status', status);
        if (notes) fd.append('notes', notes);
        await uploadFile(ws.builds.uploadPath, fd, { onProgress: setProgress });
      } else {
        await ws.builds.create({ version, title, status, externalUrl, notes });
      }
      onSaved();
    } catch (ex) {
      if (ex.status === 413) setErr('Fichier trop volumineux (> 1 Go). Utilise plutôt un lien externe.');
      else setErr(ex.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le build' : 'Nouveau build'}>
      <form onSubmit={submit}>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Version">
            <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.3.1" required />
          </Field>
          <Field label="Titre">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Alpha combat" />
          </Field>
          <Field label="Statut">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: '100%', background: 'rgba(14,8,32,0.72)',
                border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
                padding: '10px 12px', color: '#ede8f8',
                fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
              }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {!isEdit && (
          <div style={{
            display: 'inline-flex', gap: 4, background: 'rgba(20,15,40,0.72)',
            borderRadius: 8, padding: 3, marginBottom: 14,
            border: '1px solid rgba(80,50,130,0.24)',
          }}>
            {[
              ['file', '📦 Fichier (≤ 1 Go)'],
              ['url', '🔗 Lien externe'],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                style={{
                  background: mode === v ? ACC : 'none',
                  color: mode === v ? '#08051a' : 'rgba(180,170,200,0.7)',
                  border: 'none', borderRadius: 6, padding: '6px 14px',
                  fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: mode === v ? 700 : 500,
                  cursor: 'pointer',
                }}
              >{l}</button>
            ))}
          </div>
        )}

        {mode === 'file' && !isEdit && (
          <Field label="Build file">
            <FileDrop value={file} onChange={setFile} label="Glisser le build (exe, zip, apk…)" />
            {saving && <ProgressBar value={progress} />}
          </Field>
        )}

        {mode === 'url' && (
          <Field label="URL externe (Itch.io, Drive, etc.)">
            <Input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}

        <Field label="Notes (changelog, instructions)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving}>
            {saving ? (mode === 'file' && !isEdit ? `${Math.round(progress * 100)} %` : '…') : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
