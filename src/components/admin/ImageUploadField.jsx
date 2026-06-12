import { useRef, useState } from 'react';
import { api, uploadFile } from '../../api/client';
import { ACC, ACC_RGB } from './ui';

// Shared image uploader (POST /images → { url, filename }). Used by the projects
// editor and the writing-space editors. Renders an aspect-ratio preview with a
// Supprimer button, or a dashed drop target with an upload progress bar.
export function ImageUploadField({ value, onChange, label, aspect = '16/9' }) {
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState(null);
  const inputRef = useRef();

  const handleFile = async (file) => {
    setErr(null);
    setProgress(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const result = await uploadFile('/images', fd, {
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      onChange(result.url, result);
    } catch (e) {
      setErr(e.message || 'Erreur lors de l\'upload');
    } finally {
      setProgress(null);
    }
  };

  const handleRemove = async () => {
    if (value?.startsWith('/api/images/')) {
      const filename = value.split('/').pop();
      try { await api.del(`/images/${filename}`); } catch { /* ignore if already gone */ }
    }
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 11.5,
          color: 'rgba(180,170,200,0.7)', marginBottom: 6, letterSpacing: '0.2px',
        }}>{label}</label>
      )}

      {value ? (
        <div style={{
          position: 'relative', borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(80,50,130,0.3)',
          aspectRatio: aspect, background: 'rgba(14,8,32,0.6)',
        }}>
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 8 }}>
            <button
              onClick={handleRemove}
              style={{
                background: 'rgba(10,4,24,0.85)', border: '1px solid rgba(255,100,120,0.35)',
                borderRadius: 6, color: 'rgba(255,120,140,0.9)',
                cursor: 'pointer', padding: '3px 9px', fontSize: 12, fontFamily: "'Inter',sans-serif",
              }}
            >Supprimer</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: '1px dashed rgba(80,50,130,0.35)', borderRadius: 8,
            background: 'rgba(14,8,32,0.4)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '24px 16px', transition: 'border-color 0.2s', aspectRatio: aspect,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACC)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(80,50,130,0.35)')}
        >
          {progress !== null ? (
            <>
              <div style={{ width: '60%', height: 4, background: 'rgba(80,50,130,0.3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: ACC, width: `${progress}%`, transition: 'width 0.1s', borderRadius: 2 }} />
              </div>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: `rgba(${ACC_RGB},0.8)` }}>{progress}%</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20, color: `rgba(${ACC_RGB},0.5)` }}>↑</span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.55)' }}>
                Cliquer pour uploader (JPG, PNG, WebP — max 40 Mo, compressé automatiquement)
              </span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
      {err && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#ff8a9b', marginTop: 5 }}>{err}</p>}
    </div>
  );
}
