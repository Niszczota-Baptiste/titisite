import { useRef, useState } from 'react';
import { api } from '../../../../api/client';
import { useToast } from '../../../../ui/ToastProvider';
import { ImageUploadField } from '../../ImageUploadField';
import { selectStyle, blockLabel } from './widgets';

const TYPES = [
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'schema', label: 'Schéma' },
  { value: 'carte', label: 'Carte' },
];

// Manages the media list for a work or a chapter. `owner` is { workId } or
// { chapterId }. Uploading goes through the shared image pipeline, then creates
// a media row; rows reorder by drag-and-drop and edit captions/type inline.
export function MediaManager({ owner, media = [], onChanged, label = 'Médias' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const add = async (url, result) => {
    if (!result?.filename) return;
    setBusy(true);
    try {
      await api.writing.media.create({ ...owner, filename: result.filename, type: 'screenshot', caption: '' });
      await onChanged();
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id, patch) => {
    try {
      await api.writing.media.update(id, patch);
      await onChanged();
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    }
  };

  const remove = async (id) => {
    try {
      await api.writing.media.remove(id);
      await onChanged();
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    }
  };

  const onDrop = async (to) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOver(null);
    if (from == null || from === to) return;
    const ids = media.map((m) => m.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    try {
      await api.writing.media.reorder(ids);
      await onChanged();
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    }
  };

  return (
    <div>
      <span style={blockLabel}>{label}</span>

      {media.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 12 }}>
          {media.map((m, i) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDrop={() => onDrop(i)}
              style={{
                border: `1px solid ${dragOver === i ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
                borderRadius: 10, overflow: 'hidden', background: 'rgba(8,5,18,0.6)', cursor: 'grab',
              }}
            >
              <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <button type="button"
                  onClick={() => remove(m.id)}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(10,4,24,0.85)', border: '1px solid rgba(255,100,120,0.35)', borderRadius: 6, color: 'rgba(255,120,140,0.9)', cursor: 'pointer', padding: '2px 8px', fontSize: 12 }}
                >Supprimer</button>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select value={m.type} onChange={(e) => update(m.id, { type: e.target.value })} style={{ ...selectStyle, padding: '6px 8px', fontSize: 12 }}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  defaultValue={m.caption}
                  placeholder="Légende…"
                  onBlur={(e) => { if (e.target.value !== m.caption) update(m.id, { caption: e.target.value }); }}
                  style={{ width: '100%', background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 6, padding: '6px 8px', color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 12, outline: 'none' }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ opacity: busy ? 0.6 : 1, maxWidth: 280 }}>
        <ImageUploadField value="" onChange={add} aspect="4/3" />
      </div>
    </div>
  );
}
