import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile, api } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { Field, Input } from '../ui';
import { ItemList } from '../ItemList';

const CLIP_SEC = 30;
const ACC = '#c9a8e8';
const ACC_DIM = 'rgba(201,168,232,0.25)';

function fmtSec(s) {
  const t = Math.floor(Math.max(0, s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ── Clip selector timeline ──────────────────────────────────────────────────
function ClipTimeline({ clipStart, audioDur, onChange }) {
  const barRef = useRef(null);
  const dragging = useRef(false);

  const clamp = useCallback((start) => {
    const max = Math.max(0, audioDur - CLIP_SEC);
    return Math.max(0, Math.min(max, start));
  }, [audioDur]);

  const posFromEvent = useCallback((e) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return clipStart;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return clamp(pct * audioDur);
  }, [audioDur, clipStart, clamp]);

  useEffect(() => {
    const onMove = (e) => { if (dragging.current) onChange(posFromEvent(e)); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [posFromEvent, onChange]);

  if (!audioDur) return null;

  const clipPct = (clipStart / audioDur) * 100;
  const clipW = Math.min((CLIP_SEC / audioDur) * 100, 100 - clipPct);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(180,170,200,0.5)' }}>0:00</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: 'rgba(180,170,200,0.5)' }}>
          Glisser pour choisir le clip
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(180,170,200,0.5)' }}>
          {fmtSec(audioDur)}
        </span>
      </div>
      <div
        ref={barRef}
        onMouseDown={(e) => { dragging.current = true; onChange(posFromEvent(e)); }}
        style={{ position: 'relative', height: 36, cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Track */}
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0, height: 6,
          transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
        }} />
        {/* Clip window */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${clipPct}%`, width: `${clipW}%`,
          background: ACC_DIM, border: `1px solid ${ACC}`,
          borderRadius: 4, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{
            width: 2, height: 14, background: ACC,
            borderRadius: 1, boxShadow: `0 0 6px ${ACC}`,
          }} />
        </div>
        {/* Start label */}
        <div style={{
          position: 'absolute', top: '100%', marginTop: 4,
          left: `${clipPct}%`, transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 10, color: ACC,
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {fmtSec(clipStart)}
        </div>
      </div>
    </div>
  );
}

// ── Per-track form with audio ──────────────────────────────────────────────
function TrackForm({ d, set }) {
  const confirm = useConfirm();
  const audioRef = useRef(null);
  const [audioDur, setAudioDur] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [err, setErr] = useState(null);
  const previewTimer = useRef(null);
  const dropRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const clipStart = d.clip_start ?? 0;

  // Load audio metadata when filename changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !d.filename) { setAudioDur(0); return; }
    const onMeta = () => {
      const dur = audio.duration;
      if (isFinite(dur)) {
        setAudioDur(dur);
        set((prev) => ({ ...prev, duration: fmtSec(dur) }));
      }
    };
    audio.addEventListener('loadedmetadata', onMeta);
    audio.src = `/api/audio/${d.filename}`;
    audio.load();
    return () => audio.removeEventListener('loadedmetadata', onMeta);
  }, [d.filename]); // eslint-disable-line

  const doUpload = async (file) => {
    if (!file || !d.id) return;
    setUploading(true);
    setUploadPct(0);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const updated = await uploadFile(`/tracks/${d.id}/audio`, fd, {
        onProgress: (p) => setUploadPct(Math.round(p * 100)),
      });
      set((prev) => ({ ...prev, filename: updated.filename }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAudio = async () => {
    if (!d.id) return;
    const ok = await confirm({
      title: 'Supprimer le fichier audio',
      message: 'Le morceau perdra son fichier audio. Cette action est définitive.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      await api.del(`/tracks/${d.id}/audio`);
      set((prev) => ({ ...prev, filename: null, clip_start: 0, duration: '0:00' }));
      setAudioDur(0);
    } catch (e) {
      setErr(e.message);
    }
  };

  const togglePreview = () => {
    const audio = audioRef.current;
    if (!audio || !d.filename) return;
    if (previewing) {
      audio.pause();
      clearTimeout(previewTimer.current);
      setPreviewing(false);
    } else {
      audio.currentTime = clipStart;
      audio.play().catch(() => {});
      setPreviewing(true);
      previewTimer.current = setTimeout(() => {
        audio.pause();
        setPreviewing(false);
      }, CLIP_SEC * 1000);
    }
  };

  // Stop preview when clip_start changes
  useEffect(() => {
    if (previewing && audioRef.current) {
      audioRef.current.pause();
      clearTimeout(previewTimer.current);
      setPreviewing(false);
    }
  }, [clipStart]); // eslint-disable-line

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  };

  const inputRow = { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 };

  return (
    <div>
      <audio ref={audioRef} preload="none" />

      {/* Text fields */}
      <div style={inputRow}>
        <Field label="Titre">
          <Input value={d.title} onChange={(e) => set((p) => ({ ...p, title: e.target.value }))} />
        </Field>
        <Field label="Genre">
          <Input value={d.genre} onChange={(e) => set((p) => ({ ...p, genre: e.target.value }))} />
        </Field>
      </div>

      {/* Audio section — only for existing tracks */}
      {d.id && (
        <div style={{
          marginTop: 4, padding: '14px 16px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(80,50,130,0.28)',
          borderRadius: 10,
        }}>
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600,
            color: 'rgba(180,170,200,0.5)', letterSpacing: '1px',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            Audio
          </p>

          {err && (
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: '#ff8a9b', marginBottom: 10 }}>
              {err}
            </p>
          )}

          {!d.filename ? (
            /* Drop zone */
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.onchange = (e) => doUpload(e.target.files[0]);
                input.click();
              }}
              style={{
                border: `2px dashed ${dragOver ? ACC : 'rgba(80,50,130,0.4)'}`,
                borderRadius: 8, padding: '20px 16px',
                textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'rgba(201,168,232,0.05)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              {uploading ? (
                <div>
                  <div style={{
                    height: 3, background: 'rgba(255,255,255,0.06)',
                    borderRadius: 2, overflow: 'hidden', marginBottom: 8,
                  }}>
                    <div style={{
                      height: '100%', width: `${uploadPct}%`,
                      background: ACC, borderRadius: 2, transition: 'width 0.2s',
                    }} />
                  </div>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>
                    Envoi… {uploadPct}%
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.7)', marginBottom: 4 }}>
                    Glisser un fichier audio ici
                  </p>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.4)' }}>
                    ou cliquer pour sélectionner (mp3, wav, ogg…)
                  </p>
                </>
              )}
            </div>
          ) : (
            /* Audio loaded — show clip selector */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={ACC}>
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                  </svg>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(232,228,248,0.8)' }}>
                    {audioDur ? `Durée : ${fmtSec(audioDur)}` : 'Chargement…'}
                  </span>
                </div>
                <button
                  onClick={removeAudio}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'Inter',sans-serif", fontSize: 12,
                    color: 'rgba(255,100,120,0.7)', padding: '4px 8px', borderRadius: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ff8a9b')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,100,120,0.7)')}
                >
                  Supprimer l'audio
                </button>
              </div>

              <ClipTimeline
                clipStart={clipStart}
                audioDur={audioDur}
                onChange={(s) => set((p) => ({ ...p, clip_start: s }))}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.5)' }}>
                  Clip : {fmtSec(clipStart)} → {fmtSec(clipStart + CLIP_SEC)} (30s)
                </span>
                <button
                  onClick={togglePreview}
                  style={{
                    background: previewing ? ACC : 'rgba(201,168,232,0.12)',
                    border: `1px solid ${ACC}`,
                    borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                    fontFamily: "'Inter',sans-serif", fontSize: 12,
                    color: previewing ? '#08051a' : ACC,
                    transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {previewing ? '■ Stop' : '▶ Écouter le clip (30s)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!d.id && (
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: 'rgba(180,170,200,0.4)', marginTop: 8, fontStyle: 'italic',
        }}>
          Enregistre d'abord le titre pour pouvoir ajouter un fichier audio.
        </p>
      )}
    </div>
  );
}

const EMPTY = { title: '', genre: '', duration: '0:00', clip_start: 0 };

export function TracksEditor() {
  return (
    <ItemList
      title="Musique"
      collection="tracks"
      emptyDraft={EMPTY}
      renderPreview={(tr) => (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {tr.filename ? (
            <span style={{ fontSize: 14, color: ACC }} title="Audio disponible">♪</span>
          ) : (
            <span style={{ fontSize: 14, color: 'rgba(180,170,200,0.25)' }} title="Pas d'audio">♪</span>
          )}
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600, color: '#ede8f8',
          }}>{tr.title || '—'}</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>
            {tr.genre}
          </span>
          <span style={{
            marginLeft: 'auto', fontFamily: 'monospace', fontSize: 12, color: 'rgba(180,170,200,0.6)',
          }}>
            {tr.duration}
          </span>
        </div>
      )}
      renderForm={(d, set) => <TrackForm d={d} set={set} />}
    />
  );
}
