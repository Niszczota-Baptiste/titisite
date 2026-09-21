import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { applePlayback, displayedPosition } from './playbackProgress';

export function usePlaybackProgress(data, music) {
  const mine = data?.apple?.canConfigure ? 'apple' : 'spotify';
  const connected = Boolean(data?.[mine]?.connected);
  const items = useRef([]); items.current = data?.queue || [];
  const [sample, setSample] = useState(null), [started, setStarted] = useState([]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setSample(null); setStarted([]);
    if (!connected) return;
    let stopped = false, timer;
    const saved = new Set();
    const tick = async () => {
      try {
        if (document.hidden) return;
        const next = mine === 'spotify' ? await api.playlist.spotifyPlayback()
          : { current: applePlayback(music, items.current), ageMs: 0 };
        if (stopped) return;
        setSample({ ...next, receivedAt: Date.now() });
        const id = next.current?.playing ? next.current.id : null;
        if (id && !saved.has(id)) {
          if (mine === 'apple') await api.playlist.appleStarted(id);
          if (stopped) return;
          saved.add(id); setStarted(old => old.includes(id) ? old : [...old, id]);
        }
      } catch {
        if (!stopped) setSample({ current: null, error: 'unavailable', receivedAt: Date.now() });
      } finally {
        if (!stopped) timer = setTimeout(tick, mine === 'apple' ? 1000 : 5000);
      }
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [mine, connected, music]);
  const current = sample?.current;
  const stale = Boolean(sample && clock - sample.receivedAt + (sample.ageMs || 0) >= 15000);
  return { mine, current, started, position: displayedPosition(sample, clock), stale, error: sample?.error };
}
