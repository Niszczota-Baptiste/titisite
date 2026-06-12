import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../api/client';

// Public-site 30 s clip cap (the full files are only streamed by the writing
// reader's own player, ReaderAudio.jsx).
export const CLIP_SEC = 30;

const Ctx = createContext(null);
export function useMusicPlayer() {
  return useContext(Ctx);
}

// Global music playback state + the single <audio> element, mounted once in
// App.jsx so playback survives route changes. The Music section and the
// floating MiniPlayer are both consumers — same state, two UIs.
export function MusicPlayerProvider({ children }) {
  const [tracks, setTracks] = useState([]);
  const [playing, setPlaying] = useState(null);  // index in `tracks` or null
  const [current, setCurrent] = useState(null);  // last played index — survives pause
  const [progress, setProgress] = useState({});  // 0-100 within clip/duration
  const [elapsed, setElapsed] = useState({});    // seconds elapsed in current clip
  const [volume, setVolume] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => { window.__musicPlaying = playing !== null; }, [playing]);

  const hasAudio = (i) => Boolean(tracks[i]?.filename);

  // ── Real audio playback (30 s clip window) ───────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    if (playing === null || !hasAudio(playing)) {
      audio.pause();
      audio.src = '';
      return undefined;
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
  }, [playing, tracks]); // eslint-disable-line

  // Volume sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ── Fake progress for tracks without audio ───────────────────────────────
  useEffect(() => {
    if (playing === null || hasAudio(playing)) return undefined;
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

  const startAt = (idx) => {
    setPlaying(idx);
    setCurrent(idx);
    setProgress((p) => ({ ...p, [idx]: 0 }));
    setElapsed((p) => ({ ...p, [idx]: 0 }));
  };

  const handleNext = (cur) => {
    if (!tracks.length) return;
    const idx = shuffle
      ? Math.floor(Math.random() * tracks.length)
      : ((cur ?? -1) + 1) % tracks.length;
    startAt(idx);
  };

  // `list` (optional) replaces the playlist — passed by the Music section so
  // the provider doesn't need to fetch the tracks itself.
  const toggle = (i, list) => {
    const tl = list || tracks;
    if (list && list !== tracks) setTracks(list);
    if (playing === i && (!list || list === tracks)) {
      if (tl[i]?.filename) audioRef.current?.pause();
      setPlaying(null);
    } else {
      setPlaying(i);
      setCurrent(i);
      setProgress((p) => ({ ...p, [i]: p[i] || 0 }));
      setElapsed((p) => ({ ...p, [i]: p[i] ? (p[i] / 100) * CLIP_SEC : 0 }));
      trackEvent('track_play', tl[i]?.title || `track-${i}`);
    }
  };

  const prev = () => {
    if (!tracks.length) return;
    const idx = (((playing ?? 0) - 1) + tracks.length) % tracks.length;
    startAt(idx);
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

  // Pause but keep the current track loaded (mini-player shows ▶ to resume).
  const pause = () => setPlaying(null);

  // Close the mini-player entirely.
  const close = () => {
    setPlaying(null);
    setCurrent(null);
  };

  const value = {
    tracks,
    playing,
    current,
    currentTrack: current !== null ? tracks[current] : null,
    progress,
    elapsed,
    volume,
    shuffle,
    repeat,
    setVolume,
    setShuffle,
    setRepeat,
    toggle,
    prev,
    next,
    seekTo,
    pause,
    close,
  };

  return (
    <Ctx.Provider value={value}>
      <audio ref={audioRef} preload="none" />
      {children}
    </Ctx.Provider>
  );
}
