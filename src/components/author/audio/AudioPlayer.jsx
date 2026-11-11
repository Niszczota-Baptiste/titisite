import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Btn, cx } from '../ui';
import { MARKER_LABELS, clampMs, formatMs, loopJump, neighbourMarker, normalizeLoop, sortMarkers } from './time.js';

// Lecteur d'une prise : lecture, déplacement, repères cliquables et boucle
// A→B. Il ne modifie jamais le fichier : une boucle n'est qu'une façon
// d'écouter. La source est une adresse de même origine (prise privée servie
// derrière la garde, ou fichier de l'appareil) : le navigateur ne télécharge
// que ce qu'il lit et sait se déplacer dans une longue prise.
//
// Réf. impérative : { timeMs(), seek(ms), play(), pause() } — pour poser un
// repère « ici » ou comparer deux versions au même endroit.

export const AudioPlayer = forwardRef(function AudioPlayer(
  { src, durationMs = 0, markers = [], loop = null, onLoop, onPickMarker, label = 'Prise', compact = false }, ref,
) {
  const audio = useRef(null);
  const raf = useRef(0);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [mediaMs, setMediaMs] = useState(0);
  const [error, setError] = useState(null);
  const [pendingA, setPendingA] = useState(null);

  // La durée annoncée par le fichier fait foi ; à défaut (certains
  // enregistrements du navigateur l'ignorent), celle connue de l'atelier.
  const total = mediaMs || durationMs || 0;
  const now = () => Math.round((audio.current?.currentTime || 0) * 1000);

  const seek = useCallback((ms) => {
    const el = audio.current;
    if (!el) return;
    const target = total ? clampMs(ms, total) : Math.max(0, ms);
    el.currentTime = target / 1000;
    setTimeMs(target);
  }, [total]);

  useImperativeHandle(ref, () => ({
    timeMs: now,
    seek,
    play: () => audio.current?.play().catch(() => {}),
    pause: () => audio.current?.pause(),
  }), [seek]);

  // Pendant la lecture, la position est lue à chaque image : la reprise d'une
  // boucle ne dépend pas du rythme (≈ 4/s) des événements `timeupdate`.
  useEffect(() => {
    if (!playing) return undefined;
    const step = () => {
      const t = now();
      const back = loopJump(t, loopRef.current);
      if (back !== null && audio.current) audio.current.currentTime = back / 1000;
      setTimeMs(back !== null ? back : t);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  useEffect(() => { setTimeMs(0); setMediaMs(0); setError(null); setPlaying(false); setPendingA(null); }, [src]);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      // Lancer une boucle depuis l'extérieur de celle-ci commence à son début.
      if (loop && (now() >= loop.b || now() < loop.a)) seek(loop.a);
      el.play().catch(() => setError('lecture'));
    } else el.pause();
  };

  const setA = () => { setPendingA(now()); onLoop?.(null); };
  const setB = () => {
    const made = normalizeLoop(pendingA ?? 0, now(), total);
    if (made) { onLoop?.(made); setPendingA(null); seek(made.a); }
  };
  const jump = (dir) => {
    const m = neighbourMarker(markers, now(), dir);
    if (m) seek(m.tMs); else seek(dir > 0 ? total : 0);
  };

  const pct = (ms) => (total ? `${Math.min(100, Math.max(0, (ms / total) * 100))}%` : '0%');
  const sorted = sortMarkers(markers);

  return (
    <div className={cx('au-player', compact && 'is-compact')}>
      <audio ref={audio} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setTimeMs(now()); }}
        onEnded={() => { if (loopRef.current) { seek(loopRef.current.a); audio.current?.play().catch(() => {}); } else setPlaying(false); }}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setMediaMs(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : 0); }}
        onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setMediaMs(Math.round(d * 1000)); }}
        onError={() => setError('chargement')} />
      <div className="au-player-row">
        <Btn variant="primary" icon onClick={toggle} aria-label={playing ? `Mettre en pause — ${label}` : `Écouter — ${label}`} disabled={!!error}>{playing ? '❚❚' : '▶'}</Btn>
        <span className="au-player-time" aria-live="off">{formatMs(timeMs)} <span className="au-faint">/ {total ? formatMs(total) : '–:––'}</span></span>
        {!compact && (
          <span className="au-player-jumps">
            <Btn size="small" variant="ghost" icon onClick={() => seek(now() - 5000)} aria-label="Reculer de 5 secondes">−5</Btn>
            <Btn size="small" variant="ghost" icon onClick={() => seek(now() + 5000)} aria-label="Avancer de 5 secondes">+5</Btn>
            {sorted.length > 0 && <Btn size="small" variant="ghost" icon onClick={() => jump(-1)} aria-label="Repère précédent">⏮</Btn>}
            {sorted.length > 0 && <Btn size="small" variant="ghost" icon onClick={() => jump(1)} aria-label="Repère suivant">⏭</Btn>}
          </span>
        )}
      </div>
      <div className="au-player-track">
        {loop && <span className="au-player-loop" style={{ left: pct(loop.a), width: `calc(${pct(loop.b)} - ${pct(loop.a)})` }} aria-hidden />}
        {pendingA !== null && <span className="au-player-a" style={{ left: pct(pendingA) }} aria-hidden />}
        <input type="range" className="au-player-seek" min={0} max={total || 1} step={50} value={Math.min(timeMs, total || 1)}
          onChange={(e) => seek(Number(e.target.value))} disabled={!total} aria-label={`Position dans la prise — ${label}`}
          aria-valuetext={`${formatMs(timeMs)} sur ${formatMs(total)}`} />
        {sorted.map((m) => (
          <button key={m.id ?? `${m.tMs}-${m.label}`} type="button" className={cx('au-player-mark', `is-${m.kind || 'marker'}`)} style={{ left: pct(m.tMs) }}
            onClick={() => { seek(m.tMs); onPickMarker?.(m); }}
            title={`${MARKER_LABELS[m.kind] || 'Repère'} ${formatMs(m.tMs)}${m.label ? ` — ${m.label}` : ''}`}
            aria-label={`Aller au ${(MARKER_LABELS[m.kind] || 'Repère').toLowerCase()} ${m.label || ''} à ${formatMs(m.tMs)}`} />
        ))}
      </div>
      {!compact && (
        <div className="au-player-row au-player-loopbar">
          <span className="au-faint">Boucle</span>
          <Btn size="small" variant="ghost" on={pendingA !== null} onClick={setA} aria-label="Début de boucle ici">A{pendingA !== null ? ` ${formatMs(pendingA)}` : loop ? ` ${formatMs(loop.a)}` : ''}</Btn>
          <Btn size="small" variant="ghost" onClick={setB} disabled={pendingA === null} aria-label="Fin de boucle ici">B{loop ? ` ${formatMs(loop.b)}` : ''}</Btn>
          {(loop || pendingA !== null) && <Btn size="small" variant="ghost" onClick={() => { setPendingA(null); onLoop?.(null); }}>Lecture normale</Btn>}
        </div>
      )}
      {error && (
        <p className="au-error" role="alert" style={{ marginTop: 8, marginBottom: 0 }}>
          {error === 'chargement' ? 'Prise illisible pour l\'instant (hors connexion, ou format que ce navigateur ne lit pas). L\'original reste intact.' : 'La lecture n\'a pas pu démarrer.'}
        </p>
      )}
    </div>
  );
});
