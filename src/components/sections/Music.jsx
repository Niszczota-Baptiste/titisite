import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

const CLIP_SEC = 30;

function VolumeSlider({ value, onChange, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const getVal = useCallback((e) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
  }, []);

  useEffect(() => {
    const onMove = (e) => { if (dragging.current) onChange(getVal(e)); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [getVal, onChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
        <path d="M1 4h3l3-3v10l-3-3H1V4z" fill="var(--text-faint)" />
        {value > 0.01 && (
          <path d="M9 2a5 5 0 0 1 0 8" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        )}
        {value > 0.5 && (
          <path d="M11 0a7 7 0 0 1 0 12" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
        )}
      </svg>
      <div
        ref={trackRef}
        data-interactive
        onMouseDown={(e) => { dragging.current = true; onChange(getVal(e)); }}
        style={{ position: 'relative', width: 88, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none' }}
      >
        <div style={{ width: '100%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${value * 100}%`, background: acc.hex,
            borderRadius: 2, boxShadow: `0 0 6px rgba(${acc.rgb},0.5)`, transition: 'width 0.05s',
          }} />
        </div>
        <div style={{
          position: 'absolute', left: `${value * 100}%`, transform: 'translate(-50%,-50%)', top: '50%',
          width: 11, height: 11, borderRadius: '50%', background: acc.hex,
          boxShadow: `0 0 8px rgba(${acc.rgb},0.55)`, pointerEvents: 'none', transition: 'left 0.05s',
        }} />
      </div>
    </div>
  );
}

function Waveform({ playing, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const dur = ['0.6s', '0.8s', '0.55s', '0.75s', '0.65s', '0.9s', '0.7s', '0.5s'];
  return (
    <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', height: 28 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 2.5, borderRadius: 2, background: acc.hex,
            opacity: playing ? 0.65 : 0.18,
            height: playing ? undefined : '3px', minHeight: 3,
            animation: playing
              ? `wave${(i % 4) + 1} ${dur[i % 8]} ${i * 0.04}s ease-in-out infinite alternate`
              : 'none',
            transition: 'opacity 0.4s',
          }}
        />
      ))}
    </div>
  );
}

function TrackRow({ track, playing, progress, onToggle, accent }) {
  const [hov, setHov] = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onToggle}
      data-interactive
      style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '14px 32px',
        background: playing ? `rgba(${acc.rgb},0.04)` : hov ? 'var(--track-hov)' : 'transparent',
        borderBottom: '1px solid var(--border-dim)', cursor: 'pointer',
        transition: 'background 0.2s', position: 'relative', overflow: 'hidden',
      }}
    >
      {playing && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, height: 1.5,
          width: `${progress}%`, background: `linear-gradient(90deg,${acc.hex}44,${acc.hex})`,
          transition: 'width 0.12s linear',
        }} />
      )}
      <div style={{
        width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-solid)',
        border: `1px solid ${playing ? acc.hex : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: playing ? acc.hex : 'var(--text-faint)',
        fontSize: 11, transition: 'all 0.2s',
        boxShadow: playing ? `0 0 10px rgba(${acc.rgb},0.4)` : 'none',
      }}>
        {playing ? '■' : '▶'}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 500,
          color: playing ? acc.hex : 'var(--text-dim)', transition: 'color 0.2s',
        }}>
          {track.title}
        </p>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
          {track.genre}
          {track.filename && (
            <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 10 }}>· extrait 30s</span>
          )}
        </p>
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-faint)' }}>
        {track.duration}
      </span>
    </div>
  );
}

export function Music({ t, accent, tracks = [] }) {
  const [playing, setPlaying] = useState(null);
  const [progress, setProgress] = useState({});   // 0-100 within clip/duration
  const [elapsed, setElapsed] = useState({});      // seconds elapsed in current clip
  const [volume, setVolume] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const audioRef = useRef(null);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  useEffect(() => { window.__musicPlaying = playing !== null; }, [playing]);

  const hasAudio = (i) => Boolean(tracks[i]?.filename);

  // ── Real audio playback ──────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing === null || !hasAudio(playing)) {
      audio.pause();
      audio.src = '';
      return;
    }

    const tr = tracks[playing];
    const clipStart = tr.clip_start ?? 0;

    audio.volume = volume;
    audio.src = `/api/audio/${tr.filename}`;
    audio.load();

    const onReady = () => {
      audio.currentTime = clipStart;
      audio.play().catch(() => {});
    };

    const onTimeUpdate = () => {
      const rel = audio.currentTime - clipStart;
      if (rel >= CLIP_SEC) {
        audio.pause();
        setProgress((p) => ({ ...p, [playing]: 100 }));
        setElapsed((p) => ({ ...p, [playing]: CLIP_SEC }));
        if (repeat) {
          audio.currentTime = clipStart;
          audio.play().catch(() => {});
        } else {
          handleNext(playing);
        }
        return;
      }
      const pct = Math.max(0, (rel / CLIP_SEC) * 100);
      setProgress((p) => ({ ...p, [playing]: pct }));
      setElapsed((p) => ({ ...p, [playing]: Math.max(0, rel) }));
    };

    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.pause();
    };
  }, [playing]); // eslint-disable-line

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ── Fake progress for tracks without audio ───────────────────────────────
  useEffect(() => {
    if (playing === null || hasAudio(playing)) return;
    const iv = setInterval(() => {
      setProgress((pr) => {
        const cur = pr[playing] || 0;
        if (cur >= 100) {
          if (repeat) return { ...pr, [playing]: 0 };
          setPlaying(null);
          return pr;
        }
        return { ...pr, [playing]: cur + 0.38 };
      });
    }, 120);
    return () => clearInterval(iv);
  }, [playing, repeat, tracks]); // eslint-disable-line

  const handleNext = (current) => {
    const idx = shuffle
      ? Math.floor(Math.random() * tracks.length)
      : ((current ?? -1) + 1) % tracks.length;
    setPlaying(idx);
    setProgress((p) => ({ ...p, [idx]: 0 }));
    setElapsed((p) => ({ ...p, [idx]: 0 }));
  };

  const toggle = (i) => {
    if (playing === i) {
      if (hasAudio(i)) audioRef.current?.pause();
      setPlaying(null);
    } else {
      setPlaying(i);
      setProgress((p) => ({ ...p, [i]: p[i] || 0 }));
      setElapsed((p) => ({ ...p, [i]: p[i] ? (p[i] / 100) * CLIP_SEC : 0 }));
    }
  };

  const prev = () => {
    const idx = (((playing ?? 0) - 1) + tracks.length) % tracks.length;
    setPlaying(idx);
    setProgress((p) => ({ ...p, [idx]: 0 }));
    setElapsed((p) => ({ ...p, [idx]: 0 }));
  };

  const next = () => handleNext(playing);

  const seekTo = (pct) => {
    if (playing === null) return;
    setProgress((p) => ({ ...p, [playing]: pct }));
    if (hasAudio(playing) && audioRef.current) {
      const tr = tracks[playing];
      const clipStart = tr.clip_start ?? 0;
      audioRef.current.currentTime = clipStart + (pct / 100) * CLIP_SEC;
    }
  };

  // ── Time formatting ──────────────────────────────────────────────────────
  const fmtElapsed = (i) => {
    if (i === null || !tracks[i]) return '0:00';
    if (hasAudio(i)) {
      const s = Math.floor(elapsed[i] || 0);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    // Simulated: use duration string + percentage
    const [m, s] = (tracks[i].duration || '0:00').split(':').map(Number);
    const tot = m * 60 + s;
    const cur = Math.floor((tot * (progress[i] || 0)) / 100);
    return `${Math.floor(cur / 60)}:${String(cur % 60).padStart(2, '0')}`;
  };

  const fmtTotal = (tr) => {
    if (!tr) return '—';
    if (tr.filename) return '0:30';
    return tr.duration || '—';
  };

  const cur = playing !== null ? tracks[playing] : null;
  const curProg = playing !== null ? progress[playing] || 0 : 0;
  const isPlaying = playing !== null;

  const iconBtn = (active, onClick, children) => (
    <button
      data-interactive onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? acc.hex : 'var(--text-faint)',
        padding: 6, borderRadius: 6, transition: 'color 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = acc.hex)}
      onMouseLeave={(e) => (e.currentTarget.style.color = active ? acc.hex : 'var(--text-faint)')}
    >
      {children}
    </button>
  );

  return (
    <Section id="music" bg="var(--section-alt)">
      <audio ref={audioRef} preload="none" />
      <SectionHeader title={t.music.title} subtitle={t.music.subtitle} accent={accent} />
      <div
        className="reveal"
        style={{
          background: 'var(--player-bg)',
          border: `1px solid ${isPlaying ? acc.hex + '33' : 'var(--border)'}`,
          borderRadius: 20, overflow: 'hidden', backdropFilter: 'blur(20px)',
          boxShadow: isPlaying
            ? `0 0 50px rgba(${acc.rgb},0.12),0 0 100px rgba(${acc.rgb},0.06)`
            : 'none',
          transition: 'border-color 0.6s ease,box-shadow 0.6s ease',
        }}
      >
        <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid var(--border-dim)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <p style={{
                fontFamily: "'Inter',sans-serif", fontSize: 10.5, color: 'var(--text-faint)',
                letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 8,
              }}>
                Now Playing
              </p>
              <p style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
                color: isPlaying ? acc.hex : 'var(--text)',
                marginBottom: 4, letterSpacing: '-0.3px', transition: 'color 0.4s',
              }}>
                {cur ? cur.title : '—'}
              </p>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--text-faint)' }}>
                {cur ? cur.genre : t.music.noFile}
                {cur?.filename && (
                  <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 11 }}>· extrait 30s</span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 16 }}>
              <Waveform playing={isPlaying} accent={accent} />
              <VolumeSlider value={volume} onChange={setVolume} accent={accent} />
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                height: 3, background: 'var(--border)', borderRadius: 2,
                marginBottom: 7, cursor: 'pointer', position: 'relative',
              }}
              onClick={(e) => {
                if (playing === null) return;
                const rect = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - rect.left) / rect.width) * 100);
              }}
            >
              <div style={{
                height: '100%', width: `${curProg}%`,
                background: `linear-gradient(90deg,${acc.dim},${acc.hex})`,
                borderRadius: 2, boxShadow: `0 0 8px rgba(${acc.rgb},0.4)`,
                transition: 'width 0.12s linear', position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', right: 0, top: '50%',
                  transform: 'translate(50%,-50%)', width: 9, height: 9,
                  borderRadius: '50%', background: acc.hex, boxShadow: `0 0 6px rgba(${acc.rgb},0.8)`,
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)' }}>
                {fmtElapsed(playing)}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)' }}>
                {fmtTotal(cur)}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {iconBtn(false, prev, (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            ))}
            <button
              data-interactive
              onClick={() => toggle(playing ?? 0)}
              style={{
                width: 44, height: 44, borderRadius: '50%', background: acc.hex,
                border: 'none', cursor: 'pointer', color: '#08051a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 ${isPlaying ? 28 : 18}px rgba(${acc.rgb},${isPlaying ? 0.55 : 0.35})`,
                transition: 'transform 0.18s,box-shadow 0.3s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
            >
              {isPlaying ? (
                <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
                  <rect x="0" y="0" width="4" height="16" rx="1" />
                  <rect x="10" y="0" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="13" height="16" viewBox="0 0 13 16" fill="currentColor">
                  <path d="M0 0 L13 8 L0 16 Z" />
                </svg>
              )}
            </button>
            {iconBtn(false, next, (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 6px' }} />
            {iconBtn(shuffle, () => setShuffle((s) => !s), (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
              </svg>
            ))}
            {iconBtn(repeat, () => setRepeat((r) => !r), (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            ))}
          </div>
        </div>

        {tracks.map((tr, i) => (
          <TrackRow
            key={i}
            track={tr}
            playing={playing === i}
            progress={progress[i] || 0}
            onToggle={() => toggle(i)}
            accent={accent}
          />
        ))}
      </div>
    </Section>
  );
}
