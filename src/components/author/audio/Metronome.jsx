import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, cx } from '../ui';
import { BPM_MAX, BPM_MIN, beatsFromSignature, clampBpm, dueClicks, retime, tapTempo } from './metronome.js';

// Métronome simple et tap tempo. Les clics sont planifiés sur l'horloge audio
// (cf. metronome.js) ; l'affichage du temps fort n'est qu'un reflet et se
// passe d'animation.

const TICK_MS = 25;

export function useMetronome({ bpm, beatsPerBar = 4 }) {
  const ctx = useRef(null);
  const state = useRef(null); // { anchor, bpm, nextIndex }
  const timer = useRef(null);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const barRef = useRef(beatsPerBar);
  barRef.current = beatsPerBar;

  const click = (time, accent) => {
    const ac = ctx.current;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = accent ? 1568 : 1046;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(gain).connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  };

  const stop = useCallback(() => {
    clearInterval(timer.current);
    timer.current = null;
    state.current = null;
    setRunning(false);
    setBeat(-1);
  }, []);

  // Démarre (dans un geste de l'utilisateur : le navigateur l'exige pour le
  // son). Rend l'instant, sur l'horloge audio, du premier clic.
  const start = useCallback(async (startBpm) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx.current) ctx.current = new AC();
    if (ctx.current.state === 'suspended') await ctx.current.resume();
    clearInterval(timer.current);
    const anchor = ctx.current.currentTime + 0.08;
    state.current = { anchor, bpm: clampBpm(startBpm ?? bpm), nextIndex: 0 };
    const pump = () => {
      const s = state.current;
      if (!s) return;
      const { clicks, nextIndex } = dueClicks({ ...s, beatsPerBar: barRef.current, now: ctx.current.currentTime });
      for (const c of clicks) {
        click(c.time, c.accent);
        const delay = Math.max(0, (c.time - ctx.current.currentTime) * 1000);
        setTimeout(() => { if (state.current) setBeat(c.index % barRef.current); }, delay);
      }
      s.nextIndex = nextIndex;
    };
    pump();
    timer.current = setInterval(pump, TICK_MS);
    setRunning(true);
    return anchor;
  }, [bpm]);

  // Changement de tempo en marche : sans à-coup.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const next = clampBpm(bpm);
    if (next === s.bpm) return;
    s.anchor = retime(s, next);
    s.bpm = next;
  }, [bpm]);

  useEffect(() => () => { clearInterval(timer.current); ctx.current?.close?.().catch?.(() => {}); }, []);

  return { running, beat, start, stop };
}

export function Metronome({ bpm, signature, onBpm, title = '🥁 Métronome' }) {
  const [local, setLocal] = useState(() => clampBpm(bpm || 90));
  const [taps, setTaps] = useState([]);
  const beats = beatsFromSignature(signature);
  const metro = useMetronome({ bpm: local, beatsPerBar: beats });
  const applied = bpm ? Number(bpm) : null;

  useEffect(() => { if (bpm && !metro.running) setLocal(clampBpm(bpm)); }, [bpm]); // eslint-disable-line

  const setBpm = (v) => setLocal(clampBpm(Math.round(Number(v) * 10) / 10));
  const tap = () => {
    const next = [...taps, performance.now()].slice(-9);
    setTaps(next);
    const found = tapTempo(next);
    if (found) setLocal(clampBpm(Math.round(found.bpm)));
  };

  return (
    <div className="au-metro">
      <div className="au-card-title">{title}</div>
      <div className="au-metro-row">
        <Btn size="small" icon variant="ghost" onClick={() => setBpm(local - 1)} aria-label="Ralentir d'un battement par minute">−</Btn>
        <label className="au-metro-bpm">
          <input className="au-input" type="number" inputMode="decimal" min={BPM_MIN} max={BPM_MAX} value={local}
            onChange={(e) => setLocal(e.target.value === '' ? '' : Number(e.target.value))} onBlur={() => setBpm(local || 90)} aria-label="Tempo en battements par minute" />
          <span className="au-faint">bpm</span>
        </label>
        <Btn size="small" icon variant="ghost" onClick={() => setBpm(local + 1)} aria-label="Accélérer d'un battement par minute">+</Btn>
        <span className="au-metro-beats" aria-hidden>
          {Array.from({ length: beats }, (_, i) => <span key={i} className={cx('au-metro-dot', metro.beat === i && 'is-on', i === 0 && 'is-accent')} />)}
        </span>
      </div>
      <div className="au-metro-row">
        <Btn variant={metro.running ? 'ghost' : 'primary'} onClick={() => (metro.running ? metro.stop() : metro.start(local || 90))} aria-pressed={metro.running}>
          {metro.running ? '■ Arrêter' : '▶ Battre'}
        </Btn>
        <Btn onClick={tap} title="Tape le tempo en rythme">Tap tempo</Btn>
        {onBpm && Number(local) > 0 && Number(local) !== applied && (
          <Btn variant="ghost" size="small" onClick={() => onBpm(Number(local))}>Noter {local} bpm sur l&apos;idée</Btn>
        )}
      </div>
      <p className="au-faint au-metro-note">{beats} temps par mesure{signature ? ` (${signature})` : ''}. Pendant une prise, le clic se coupe sauf au casque : sorti du haut-parleur, il resterait dans l&apos;enregistrement.</p>
    </div>
  );
}
