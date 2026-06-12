import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { i18n } from '../data/i18n';
import { useMusicPlayer } from './MusicPlayerContext';

// Reader route = /projets/ecriture/:project/:work (exactly 4 segments,
// character sheets have 5). The reader has its own full-track player
// (ReaderAudio) — the portfolio clip must never play underneath it.
function isReaderPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 4 && parts[0] === 'projets' && parts[1] === 'ecriture';
}

// Floating mini-player: survives route changes once a track has been started
// from the Music section. Hidden on /admin and in the writing reader (where
// entering the reader also pauses playback).
export function MiniPlayer() {
  const player = useMusicPlayer();
  const { pathname } = useLocation();
  const lang = typeof localStorage !== 'undefined' ? localStorage.getItem('portfolio_lang') || 'fr' : 'fr';
  const t = (i18n[lang] || i18n.fr).player;

  const reader = isReaderPath(pathname);
  const hidden = reader || pathname.startsWith('/admin');

  const { current, pause } = player;
  // Entering the reader pauses the clip — ReaderAudio (full track) takes over.
  useEffect(() => {
    if (reader) pause();
  }, [reader]); // eslint-disable-line

  if (!player || current === null || hidden) return null;

  const { currentTrack, playing, progress, toggle, close } = player;
  const isPlaying = playing !== null;
  const pct = playing !== null ? progress[playing] || 0 : progress[current] || 0;

  return (
    <div
      role="region"
      aria-label="Lecteur audio"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(10,6,24,0.92)', backdropFilter: 'blur(16px) saturate(1.4)',
        border: '1px solid rgba(201,168,232,0.3)', borderRadius: 999,
        padding: '8px 14px 8px 8px', maxWidth: 'min(320px, calc(100vw - 48px))',
        boxShadow: '0 12px 36px rgba(0,0,0,0.45)', overflow: 'hidden',
      }}
    >
      {/* Clip progress ring substitute: thin bar along the bottom. */}
      <div style={{
        position: 'absolute', left: 0, bottom: 0, height: 2,
        width: `${pct}%`, background: '#c9a8e8', transition: 'width 0.12s linear',
      }} />

      <button
        type="button"
        onClick={() => toggle(playing !== null ? playing : current)}
        aria-label={isPlaying ? t.pause : t.play}
        style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: '#c9a8e8', color: '#08051a', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isPlaying ? '0 0 16px rgba(201,168,232,0.5)' : 'none',
          transition: 'box-shadow 0.3s',
        }}
      >
        {isPlaying ? (
          <svg width="11" height="13" viewBox="0 0 12 14" fill="currentColor"><rect x="0" y="0" width="4" height="14" rx="1" /><rect x="8" y="0" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="11" height="13" viewBox="0 0 12 14" fill="currentColor"><path d="M0 0 L12 7 L0 14 Z" /></svg>
        )}
      </button>

      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
          color: '#ede8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentTrack?.title || '—'}
        </p>
        <p style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: 'rgba(180,170,200,0.55)', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentTrack?.genre || ''}{currentTrack?.filename ? ` · ${t.clip}` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={close}
        aria-label={t.close}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
          color: 'rgba(180,170,200,0.6)', fontSize: 18, lineHeight: 1, padding: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}
