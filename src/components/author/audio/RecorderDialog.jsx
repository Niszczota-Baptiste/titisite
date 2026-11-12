import { useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { isNetworkError } from '../offline/net.js';
import { Btn, Dialog, cx } from '../ui';
import { AudioPlayer } from './AudioPlayer';
import { useMetronome } from './Metronome';
import { beatsFromSignature, recordingPlan } from './metronome.js';
import { createRecorder, getTakeFallback, noticeText, recorderMessage } from './recorderPort.js';
import { defaultTakeLabel, formatBytes, formatMs } from './time.js';

// Enregistrer une prise. Le micro n'est demandé qu'au moment d'appuyer sur
// « Enregistrer » ; un indicateur dit sans ambiguïté qu'une prise est en cours ;
// rien n'est jeté sans confirmation. `onTake({ take, label })` range la prise
// (envoi vers l'atelier, ou mise en attente sur l'appareil) et peut échouer :
// la prise reste alors ici, à réessayer ou à télécharger.

export function RecorderDialog({ open, onClose, onTake, bpm = null, signature = '', title = '🎙️ Enregistrer une prise', context = null }) {
  const confirm = useConfirm();
  const recorder = useRef(null);
  const [rec, setRec] = useState({ status: 'idle', elapsedMs: 0 });
  const [error, setError] = useState(null);
  const [take, setTake] = useState(null);
  const [label, setLabel] = useState('');
  const [marks, setMarks] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [countBars, setCountBars] = useState(0);
  const [headphones, setHeadphones] = useState(false);
  const [counting, setCounting] = useState(false);
  const beats = beatsFromSignature(signature);
  const metro = useMetronome({ bpm: bpm || 90, beatsPerBar: beats });
  const live = ['recording', 'paused', 'stopping'].includes(rec.status) || counting;

  useEffect(() => {
    if (!open) return undefined;
    let off = () => {};
    let offTake = () => {};
    let alive = true;
    setError(null); setTake(null); setSaveError(null); setMarks(0); setLabel(defaultTakeLabel());
    createRecorder().then((r) => {
      if (!alive) return;
      recorder.current = r;
      setRec(r.getState());
      off = r.subscribe(setRec);
      // Prise arrêtée depuis la notification de l'application : elle arrive ici.
      offTake = r.onTake?.((t) => { if (alive && t) setTake(t); }) || (() => {});
    }).catch((e) => setError(e));
    return () => { alive = false; off(); offTake(); recorder.current?.cancel?.(); recorder.current = null; };
  }, [open]);

  // Une prise non rangée ne doit pas disparaître sur une fermeture d'onglet.
  useEffect(() => {
    if (!live && !take) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [live, take]);

  const begin = async () => {
    const r = recorder.current;
    if (!r) return;
    setError(null);
    try {
      await r.prepare(); // l'autorisation d'abord : elle ne doit pas manger le décompte
      const plan = recordingPlan({ metronomeOn: !!bpm && (countBars > 0 || headphones), bpm, beatsPerBar: beats, countInBars: countBars, headphones });
      if (plan.countInMs > 0) {
        setCounting(true);
        await metro.start(bpm);
        await new Promise((res) => setTimeout(res, plan.countInMs));
        setCounting(false);
        if (!plan.clickDuringTake) metro.stop();
      } else if (plan.clickDuringTake) await metro.start(bpm);
      await r.start();
    } catch (e) {
      setCounting(false);
      metro.stop();
      setError(e);
    }
  };

  const finish = async () => {
    metro.stop();
    const t = await recorder.current?.stop();
    if (t) setTake(t); else setError(Object.assign(new Error('interrupted'), { code: 'interrupted' }));
  };

  const discard = async () => {
    const ok = await confirm({ title: 'Jeter cette prise ?', message: 'Elle n\'a été gardée nulle part ailleurs : elle sera perdue.', confirmLabel: 'Jeter', danger: true });
    if (!ok) return;
    take?.release?.();
    setTake(null);
    setSaveError(null);
    setLabel(defaultTakeLabel());
    setRec({ status: 'idle', elapsedMs: 0 });
  };

  const keep = async () => {
    if (!take || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onTake({ take, label: label.trim() || defaultTakeLabel() });
      take.release?.();
      setTake(null);
      onClose();
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  // L'envoi a échoué : garder la prise sur l'appareil (boîte de réception de
  // l'application), d'où elle partira au retour du réseau.
  const fallback = getTakeFallback();
  const keepLocally = async () => {
    if (!take || saving || !fallback) return;
    setSaving(true);
    try {
      await fallback.run({ take, label: label.trim() || defaultTakeLabel(), context });
      take.release?.();
      setTake(null);
      onClose();
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (live || saving) return; // on n'interrompt pas une prise par un clic à côté
    if (take) { discard(); return; }
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title={title} width={520} initialFocus={false}>
      {error && <div className="au-error" role="alert">{recorderMessage(error)}</div>}

      {!take && !live && (
        <div className="au-rec-idle">
          <p className="au-muted" style={{ marginTop: 0 }}>
            Le micro sera demandé au moment d&apos;enregistrer. La prise est gardée telle quelle : rien ne la retouche.
          </p>
          {bpm ? (
            <div className="au-rec-options">
              <label className="au-check-row">
                Décompte avant la prise :
                <select className="au-select" value={countBars} onChange={(e) => setCountBars(Number(e.target.value))} aria-label="Décompte avant la prise" style={{ width: 'auto', marginLeft: 8 }}>
                  <option value={0}>aucun</option><option value={1}>1 mesure</option><option value={2}>2 mesures</option>
                </select>
                <span className="au-faint" style={{ marginLeft: 8 }}>{bpm} bpm</span>
              </label>
              <label className="au-check-row">
                <input type="checkbox" className="au-check" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} />
                Garder le clic pendant la prise (j&apos;écoute au casque)
              </label>
            </div>
          ) : null}
          <button type="button" className="au-rec-button" onClick={begin} disabled={!recorder.current && !error}>
            <span className="au-rec-dot" aria-hidden /> Enregistrer
          </button>
        </div>
      )}

      {live && (
        <div className="au-rec-live" role="status" aria-live="polite">
          <div className={cx('au-rec-state', rec.status === 'paused' && 'is-paused')}>
            <span className="au-rec-dot is-live" aria-hidden />
            {counting ? 'Décompte…' : rec.status === 'paused' ? 'En pause' : rec.status === 'stopping' ? 'Fin de la prise…' : 'Enregistrement en cours'}
          </div>
          <div className="au-rec-time">{formatMs(rec.elapsedMs, { tenths: true })}</div>
          {rec.notice && <p className="au-offline-note">{noticeText(rec.notice)}</p>}
          {!counting && (
            <div className="au-rec-actions">
              {rec.status === 'paused'
                ? <Btn onClick={() => recorder.current?.resume()}>● Reprendre</Btn>
                : <Btn onClick={() => recorder.current?.pause()} disabled={rec.status !== 'recording'}>❚❚ Pause</Btn>}
              <Btn onClick={() => { recorder.current?.mark(''); setMarks((n) => n + 1); }} disabled={rec.status === 'stopping'}>＋ Repère{marks ? ` (${marks})` : ''}</Btn>
              <Btn variant="primary" onClick={finish} disabled={rec.status === 'stopping'}>■ Arrêter</Btn>
            </div>
          )}
        </div>
      )}

      {take && (
        <div className="au-rec-done">
          {take.integrity === 'recovered' && (
            <p className="au-error" role="alert">⚠ Prise interrompue : ce qui a été capté ({formatMs(take.durationMs)}) a été récupéré, la fin peut manquer. Écoute-la avant de t&apos;y fier.</p>
          )}
          <AudioPlayer src={take.previewUrl} durationMs={take.durationMs} markers={take.markers} label="prise à ranger" compact />
          <label className="au-field" style={{ display: 'block', marginTop: 12 }}>
            <span className="au-field-label" style={{ display: 'block' }}>Nom de la prise</span>
            <input className="au-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          </label>
          <p className="au-faint" style={{ fontSize: 12 }}>{formatMs(take.durationMs)} · {formatBytes(take.sizeBytes)}{take.markers.length ? ` · ${take.markers.length} repère(s)` : ''}</p>
          {saveError && (
            <div className="au-error" role="alert" style={{ display: 'block' }}>
              {isNetworkError(saveError) || !saveError.status
                ? `Hors connexion : la prise n'a pas pu être envoyée. Elle est encore ici — ${fallback ? 'garde-la sur cet appareil, elle partira au retour du réseau' : 'réessaie, ou télécharge le fichier pour ne pas la perdre'}.`
                : `Le site a refusé la prise (${saveError.message}). Elle est encore ici.`}
              <div style={{ marginTop: 8 }}>
                {fallback
                  ? <Btn size="small" onClick={keepLocally} disabled={saving}>{fallback.label}</Btn>
                  : <a className="au-btn is-small" href={take.previewUrl} download={take.name}>Télécharger le fichier</a>}
              </div>
            </div>
          )}
          <div className="au-rec-actions">
            <Btn variant="ghost" onClick={discard} disabled={saving}>Jeter</Btn>
            <Btn variant="primary" onClick={keep} disabled={saving}>{saving ? 'Rangement…' : saveError ? 'Réessayer' : 'Garder cette prise'}</Btn>
          </div>
        </div>
      )}
    </Dialog>
  );
}
