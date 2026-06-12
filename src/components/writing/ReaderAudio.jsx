import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { hexToRgb } from './tokens';

const FADE_MS = 1200;     // crossfade duration between chapter tracks

function fmt(s) {
  if (!Number.isFinite(s)) return '0:00';
  const t = Math.floor(Math.max(0, s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Sticky reading-mode player. Streams the FULL track (not the 30s portfolio
// clip) and, when "Suivre" is on, crossfades to the active chapter's track as
// you scroll. Consecutive chapters that share a track never cut — we only swap
// when the track id actually changes. Two <audio> elements ping-pong so one can
// fade out while the other fades in.
export function ReaderAudio({ activeTrack, accent = '#c9a8e8' }) {
  const mobile = useIsMobile(640);
  const rgb = hexToRgb(accent) || '201,168,232';

  const aRef = useRef(null);
  const bRef = useRef(null);
  const activeIdx = useRef(0);          // which element is currently audible
  const rafs = useRef({});
  const startedRef = useRef(false);     // has the user ever pressed play?
  const volRef = useRef(0.85);          // live volume, read inside fade callbacks

  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [follow, setFollow] = useState(true);
  const [curTrack, setCurTrack] = useState(null);
  const [time, setTime] = useState({ cur: 0, dur: 0 });

  const els = useCallback(() => [aRef.current, bRef.current], []);
  const audible = () => els()[activeIdx.current];

  const ramp = useCallback((el, from, to, done) => {
    if (!el) return;
    cancelAnimationFrame(rafs.current[el.dataset.k]);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / FADE_MS);
      el.volume = from + (to - from) * k;
      if (k < 1) rafs.current[el.dataset.k] = requestAnimationFrame(step);
      else if (done) done();
    };
    rafs.current[el.dataset.k] = requestAnimationFrame(step);
  }, []);

  // Bind time/ended listeners to whichever element is audible.
  useEffect(() => {
    const onTime = () => {
      const el = audible();
      if (el) setTime({ cur: el.currentTime, dur: el.duration || 0 });
    };
    const both = els();
    both.forEach((el) => { el?.addEventListener('timeupdate', onTime); el?.addEventListener('loadedmetadata', onTime); });
    return () => both.forEach((el) => { el?.removeEventListener('timeupdate', onTime); el?.removeEventListener('loadedmetadata', onTime); });
  }, [els]);

  // Load a track into the inactive element and crossfade. `autoplay` keeps the
  // current play/pause state across the swap.
  const swapTo = useCallback((track, autoplay) => {
    const fromEl = audible();
    const toEl = els()[1 - activeIdx.current];
    if (!toEl || !track?.filename) return;
    toEl.src = `/api/audio/${track.filename}`;
    toEl.currentTime = 0;
    toEl.volume = 0;
    toEl.load();
    if (autoplay) toEl.play().catch(() => {});
    ramp(toEl, 0, autoplay ? volRef.current : 0);
    if (fromEl) ramp(fromEl, fromEl.volume, 0, () => fromEl.pause());
    activeIdx.current = 1 - activeIdx.current;
    setCurTrack(track);
  }, [els, ramp]);

  // Preload the first track silently (paused) so play is instant and the title
  // shows from the start.
  useEffect(() => {
    if (curTrack || !activeTrack?.filename) return;
    const el = audible();
    if (!el) return;
    el.src = `/api/audio/${activeTrack.filename}`;
    el.volume = 0;
    el.load();
    setCurTrack(activeTrack);
  }, [activeTrack, curTrack]);

  // Follow the active chapter: crossfade when its track changes.
  useEffect(() => {
    if (!follow || !activeTrack?.filename) return;
    if (curTrack && activeTrack.id === curTrack.id) return;
    if (!startedRef.current) {
      // Not playing yet — just swap the loaded source silently.
      const el = audible();
      if (el) { el.src = `/api/audio/${activeTrack.filename}`; el.volume = 0; el.load(); }
      setCurTrack(activeTrack);
      return;
    }
    swapTo(activeTrack, playing);
  }, [activeTrack, follow]); // eslint-disable-line

  const toggle = () => {
    const el = audible();
    if (!el || !curTrack) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      startedRef.current = true;
      el.volume = volRef.current;
      el.play().catch(() => {});
      setPlaying(true);
    }
  };

  const changeVolume = (v) => {
    const vol = Math.max(0, Math.min(1, v));
    volRef.current = vol;
    setVolume(vol);
    const el = audible();
    if (el) el.volume = vol;
  };

  const seek = (pct) => {
    const el = audible();
    if (!el || !el.duration) return;
    el.currentTime = pct * el.duration;
    setTime({ cur: el.currentTime, dur: el.duration });
  };

  useEffect(() => () => Object.values(rafs.current).forEach(cancelAnimationFrame), []);

  if (!activeTrack && !curTrack) return null;
  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55,
      background: 'rgba(8,5,20,0.86)', backdropFilter: 'blur(20px) saturate(1.4)',
      borderTop: `1px solid rgba(${rgb},0.22)`,
      boxShadow: `0 -10px 40px rgba(0,0,0,0.4)`,
    }}>
      <audio ref={aRef} data-k="a" preload="none" />
      <audio ref={bRef} data-k="b" preload="none" />

      {/* Scrub bar */}
      <div
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}
        style={{ height: 4, background: 'rgba(255,255,255,0.07)', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, rgba(${rgb},0.5), rgb(${rgb}))`, transition: 'width 0.15s linear' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 12 : 18, padding: mobile ? '10px 16px' : '12px clamp(16px,5vw,56px)', maxWidth: 1180, margin: '0 auto' }}>
        <button type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Lecture'}
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            background: `rgb(${rgb})`, border: 'none', color: '#08051a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 ${playing ? 22 : 12}px rgba(${rgb},${playing ? 0.5 : 0.3})`, transition: 'box-shadow 0.3s',
          }}
        >
          {playing
            ? <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><rect x="0" y="0" width="4" height="14" rx="1" /><rect x="8" y="0" width="4" height="14" rx="1" /></svg>
            : <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><path d="M0 0 L12 7 L0 14 Z" /></svg>}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600, color: '#ede8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {curTrack?.title || '—'}
          </p>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: 'rgba(180,170,200,0.55)', marginTop: 1 }}>
            {fmt(time.cur)} / {fmt(time.dur)}{curTrack?.genre ? ` · ${curTrack.genre}` : ''}
          </p>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <button type="button"
            onClick={() => changeVolume(volume > 0 ? 0 : 0.85)}
            aria-label={volume > 0 ? 'Couper le son' : 'Rétablir le son'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(180,170,200,0.7)', padding: 0, display: 'flex' }}
          >
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
              <path d="M1 5h3l3-3v10l-3-3H1V5z" fill="currentColor" />
              {volume > 0.02 && <path d="M9.5 3a4.5 4.5 0 0 1 0 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
              {volume > 0.5 && <path d="M11.5 1a7 7 0 0 1 0 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />}
            </svg>
          </button>
          <input
            type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="Volume"
            style={{ width: mobile ? 56 : 84, accentColor: `rgb(${rgb})`, cursor: 'pointer' }}
          />
        </div>

        <button type="button"
          onClick={() => setFollow((f) => !f)}
          title="Faire suivre la musique aux chapitres"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, cursor: 'pointer',
            background: follow ? `rgba(${rgb},0.14)` : 'transparent',
            border: `1px solid ${follow ? `rgba(${rgb},0.4)` : 'rgba(120,100,160,0.3)'}`,
            color: follow ? `rgb(${rgb})` : 'rgba(180,170,200,0.6)',
            borderRadius: 20, padding: mobile ? '6px 10px' : '6px 14px',
            fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {!mobile && (follow ? 'Suivre' : 'Libre')}
        </button>
      </div>
    </div>
  );
}
