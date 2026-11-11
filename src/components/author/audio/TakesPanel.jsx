import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { Btn, Dialog, ProgressBar, PromptDialog, cx, formatDateTime, humanError, useMenu } from '../ui';
import { AudioPlayer } from './AudioPlayer';
import { PublishDialog } from './PublishDialog';
import { RecorderDialog } from './RecorderDialog';
import { MARKER_LABELS, formatBytes, formatMs, normalizeLoop, sortMarkers } from './time.js';
import { sendTake } from './upload.js';

// Prises d'une idée musicale : les versions d'une même idée, l'une d'elles
// servant de référence. On écoute, on se déplace, on pose des repères
// commentés, on boucle entre deux points, on compare deux versions au même
// endroit. Rien de tout cela ne modifie un fichier : une extraction est un
// repère nommé sur l'original.

export const AUDIO_ACCEPT = 'audio/*,.m4a,.aac,.mp3,.ogg,.opus,.wav,.flac,.webm';
const SOURCE_LABEL = { recorded: 'enregistrée', imported: 'importée', shared: 'reçue par partage' };

// Durée d'un fichier importé, lue par le navigateur (null s'il ne sait pas).
export function probeDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = new Audio();
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    el.src = url;
  });
}

export async function fileAsTake(file) {
  return {
    name: file.name || 'import.m4a', mime: file.type, sizeBytes: file.size, durationMs: await probeDuration(file),
    capturedAt: file.lastModified ? Math.floor(file.lastModified / 1000) : null, source: 'imported', integrity: '',
    markers: [], toBlob: async () => file,
  };
}

function MarkerDialog({ state, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (state) { setLabel(state.label || ''); setNote(state.note || ''); } }, [state]);
  if (!state) return null;
  const submit = (e) => { e?.preventDefault(); onSubmit({ label: label.trim(), note }); };
  return (
    <Dialog open onClose={onClose} title={state.title} width={460}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={submit}>{state.confirmLabel || 'Enregistrer'}</Btn></>}>
      <form onSubmit={submit}>
        <p className="au-faint" style={{ marginTop: 0, fontSize: 12.5 }}>{state.hint}</p>
        <label className="au-field" style={{ display: 'block' }}>
          <span className="au-field-label" style={{ display: 'block' }}>Nom (facultatif)</span>
          <input className="au-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} data-autofocus placeholder="Le motif, Refrain, À refaire…" />
        </label>
        <label className="au-field" style={{ display: 'block' }}>
          <span className="au-field-label" style={{ display: 'block' }}>Commentaire</span>
          <textarea className="au-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
        </label>
      </form>
    </Dialog>
  );
}

export function TakesPanel({ entity, onChanged, bpm = null, signature = '' }) {
  const { P } = useAuthor();
  const toast = useToast();
  const confirm = useConfirm();
  const [openMenu, menu] = useMenu();
  const takes = entity.audio || [];
  const refId = entity.referenceMediaId;
  const [selId, setSelId] = useState(() => refId || takes[0]?.id || null);
  const [markers, setMarkers] = useState([]);
  const [loop, setLoop] = useState(null);
  const [compareId, setCompareId] = useState(null);
  const [side, setSide] = useState('A');
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(null);
  const [markerDialog, setMarkerDialog] = useState(null);
  const [rename, setRename] = useState(null);
  const [publish, setPublish] = useState(null);
  const player = useRef(null);
  const fileInput = useRef(null);
  const resumeAt = useRef(null);

  const sel = takes.find((t) => t.id === selId) || takes.find((t) => t.id === refId) || takes[0] || null;
  const other = compareId ? takes.find((t) => t.id === compareId) : null;
  const playing = side === 'B' && other ? other : sel;

  useEffect(() => { if (!sel && takes.length) setSelId(takes[0].id); }, [sel, takes]);

  const loadMarkers = useCallback(() => {
    if (!sel) { setMarkers([]); return; }
    P.audio.markers.list(sel.id).then(setMarkers).catch(() => setMarkers([]));
  }, [P, sel?.id]); // eslint-disable-line
  useEffect(() => { setLoop(null); setSide('A'); setCompareId(null); loadMarkers(); }, [loadMarkers]);

  const guard = async (fn) => { try { await fn(); } catch (err) { toast.error(humanError(err.body?.error || err)); } };

  const addTake = async ({ take, label }) => {
    await sendTake(P, take, { entityId: entity.id, label, onProgress: setProgress });
    setProgress(null);
    toast.success('Prise rangée dans l\'atelier privé');
    onChanged?.();
  };

  const importFiles = async (files) => {
    for (const file of [...files]) {
      try {
        const take = await fileAsTake(file);
        const media = await sendTake(P, take, { entityId: entity.id, label: (file.name || '').replace(/\.[^.]+$/, ''), onProgress: setProgress });
        setSelId(media.id);
      } catch (err) { toast.error(`${file.name} : ${humanError(err.body?.error || err)}`); }
    }
    setProgress(null);
    onChanged?.();
  };

  const here = () => player.current?.timeMs() ?? 0;

  const submitMarker = ({ label, note }) => guard(async () => {
    const s = markerDialog;
    setMarkerDialog(null);
    if (s.id) await P.audio.markers.update(s.id, { label, note });
    else await P.audio.markers.create(sel.id, { tMs: s.tMs, endMs: s.endMs ?? undefined, kind: s.kind, label, note });
    loadMarkers();
  });

  const pickMarker = (m) => {
    if (m.endMs) { const l = normalizeLoop(m.tMs, m.endMs, m.endMs + 1); setLoop(l); player.current?.seek(m.tMs); }
    else { setLoop(null); player.current?.seek(m.tMs); }
  };

  const removeTake = async (t) => {
    const ok = await confirm({
      title: 'Supprimer cette prise ?',
      message: `« ${t.label || 'Prise'} » (${formatMs(t.durationMs)}) et ses repères seront supprimés définitivement — une prise ne passe pas par la corbeille.${t.publishedAt ? ' La piste déjà publiée à partir d\'elle restera sur le site.' : ''}`,
      confirmLabel: 'Supprimer définitivement', danger: true,
    });
    if (!ok) return;
    guard(async () => { await P.audio.remove(t.id); if (selId === t.id) setSelId(null); onChanged?.(); });
  };

  const takeMenu = (t) => [
    { label: 'Renommer', icon: '✎', onClick: () => setRename(t) },
    t.id !== refId && { label: 'Prendre comme référence', icon: '★', onClick: () => guard(async () => { await P.audio.update(t.id, { reference: true }); onChanged?.(); }) },
    takes.length > 1 && t.id !== sel?.id && { label: 'Comparer avec la prise ouverte', icon: '⇄', onClick: () => { setCompareId(t.id); setSide('A'); } },
    { label: 'Télécharger l\'original', icon: '⬇', onClick: () => { window.location.href = P.audio.downloadUrl(t.id); } },
    { label: 'Publier…', icon: '📣', onClick: () => setPublish(t.id) },
    { sep: true },
    { label: 'Supprimer la prise', icon: '🗑', danger: true, onClick: () => removeTake(t) },
  ];

  // Comparer : passer d'une version à l'autre au même endroit de l'écoute.
  const flip = (to) => { resumeAt.current = here(); setSide(to); };
  useEffect(() => {
    if (resumeAt.current === null) return;
    const at = resumeAt.current;
    resumeAt.current = null;
    const t = setTimeout(() => { player.current?.seek(at); player.current?.play(); }, 120);
    return () => clearTimeout(t);
  }, [side]);

  return (
    <div className="au-takes">
      <div className="au-card-title">
        🎙️ Prises {takes.length ? <span className="au-faint">({takes.length})</span> : null}
        <span className="au-actions">
          <Btn size="small" variant="primary" onClick={() => setRecording(true)}>● Enregistrer</Btn>
          <Btn size="small" onClick={() => fileInput.current?.click()}>Importer</Btn>
          <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} />
        </span>
      </div>
      {progress !== null && <div style={{ marginBottom: 10 }}><ProgressBar value={progress} /><span className="au-faint" style={{ fontSize: 11.5 }}>Envoi vers l&apos;atelier privé…</span></div>}

      {takes.length === 0 && (
        <p className="au-muted" style={{ fontSize: 13 }}>
          Aucune prise pour l&apos;instant. Enregistre une idée ou importe un fichier : elle reste privée — rien n&apos;est publié sans que tu le demandes.
        </p>
      )}

      {takes.length > 0 && (
        <ul className="au-take-list">
          {takes.map((t) => (
            <li key={t.id} className={cx('au-take', sel?.id === t.id && 'is-sel')}>
              <button type="button" className="au-take-main" onClick={() => setSelId(t.id)} aria-pressed={sel?.id === t.id}>
                <span className="au-take-title">{t.id === refId && <span title="Prise de référence" aria-label="Prise de référence">★ </span>}{t.label || `Prise ${t.id}`}</span>
                <span className="au-faint au-take-meta">
                  {formatMs(t.durationMs)} · {formatDateTime(t.capturedAt || t.createdAt)}{SOURCE_LABEL[t.source] ? ` · ${SOURCE_LABEL[t.source]}` : ''}
                  {t.integrity === 'recovered' && <span className="au-pill" style={{ '--pill': 'var(--au-warn)', marginLeft: 6 }} title="Enregistrement interrompu : ce qui a été capté a été récupéré, la fin peut manquer.">récupérée</span>}
                  {t.publishedAt && <span className="au-pill" style={{ '--pill': 'var(--au-ok)', marginLeft: 6 }}>publiée</span>}
                </span>
              </button>
              <Btn size="small" variant="ghost" icon onClick={(e) => openMenu(e, takeMenu(t))} aria-label={`Actions sur ${t.label || 'la prise'}`}>⋯</Btn>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="au-take-open">
          {other && (
            <div className="au-seg" role="group" aria-label="Version écoutée" style={{ marginBottom: 8 }}>
              <button type="button" className={cx(side === 'A' && 'is-on')} onClick={() => flip('A')}>A · {sel.label || 'Prise ouverte'}</button>
              <button type="button" className={cx(side === 'B' && 'is-on')} onClick={() => flip('B')}>B · {other.label || 'Autre prise'}</button>
              <button type="button" onClick={() => { setCompareId(null); setSide('A'); }}>Fin de la comparaison</button>
            </div>
          )}
          <AudioPlayer ref={player} key={playing.id} src={playing.url} durationMs={playing.durationMs}
            markers={side === 'A' ? markers : []} loop={loop} onLoop={setLoop} onPickMarker={pickMarker} label={playing.label || 'prise'} />
          {side === 'A' && (
            <>
              <div className="au-take-tools">
                <Btn size="small" onClick={() => setMarkerDialog({ title: `＋ Repère à ${formatMs(here())}`, tMs: here(), kind: 'marker', hint: 'Un point de la prise à retrouver : un motif, une idée, un passage à refaire.', confirmLabel: 'Poser le repère' })}>＋ Repère ici</Btn>
                <Btn size="small" disabled={!loop} onClick={() => setMarkerDialog({ title: `Garder la boucle ${formatMs(loop.a)} → ${formatMs(loop.b)}`, tMs: loop.a, endMs: loop.b, kind: 'loop', hint: 'La boucle est gardée comme repère : l\'original n\'est pas modifié.', confirmLabel: 'Garder la boucle' })}>Garder la boucle</Btn>
                <Btn size="small" disabled={!loop} onClick={() => setMarkerDialog({ title: `Extraire ${formatMs(loop.a)} → ${formatMs(loop.b)}`, tMs: loop.a, endMs: loop.b, kind: 'extract', hint: 'Extraction non destructive : un extrait nommé posé sur la prise, qui reste entière.', confirmLabel: 'Créer l\'extrait' })}>Extraire A→B</Btn>
              </div>
              {markers.length > 0 && (
                <ul className="au-marker-list">
                  {sortMarkers(markers).map((m) => (
                    <li key={m.id} className={cx('au-marker', `is-${m.kind}`)}>
                      <button type="button" className="au-marker-go" onClick={() => pickMarker(m)}>
                        <span className="au-marker-time">{formatMs(m.tMs, { tenths: true })}{m.endMs ? ` → ${formatMs(m.endMs, { tenths: true })}` : ''}</span>
                        <span><strong>{m.label || MARKER_LABELS[m.kind] || 'Repère'}</strong>{m.label && m.kind !== 'marker' ? <span className="au-faint"> · {MARKER_LABELS[m.kind]}</span> : null}</span>
                        {m.note && <span className="au-muted au-marker-note">{m.note}</span>}
                      </button>
                      <Btn size="small" variant="ghost" icon aria-label="Modifier le repère" onClick={() => setMarkerDialog({ id: m.id, title: 'Modifier le repère', label: m.label, note: m.note, hint: `${MARKER_LABELS[m.kind]} à ${formatMs(m.tMs)}` })}>✎</Btn>
                      <Btn size="small" variant="ghost" icon aria-label="Retirer le repère" onClick={() => guard(async () => { await P.audio.markers.remove(m.id); loadMarkers(); })}>✕</Btn>
                    </li>
                  ))}
                </ul>
              )}
              <TakeNotes key={sel.id} take={sel} onSaved={onChanged} />
              <p className="au-faint" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
                {formatBytes(sel.size)} · original conservé tel quel{sel.sha256 ? ` · empreinte ${sel.sha256.slice(0, 8)}…` : ''}
              </p>
            </>
          )}
        </div>
      )}

      {menu}
      <MarkerDialog state={markerDialog} onClose={() => setMarkerDialog(null)} onSubmit={submitMarker} />
      <PromptDialog open={!!rename} title="Renommer la prise" label="Nom" initial={rename?.label || ''} confirmLabel="Renommer"
        onClose={() => setRename(null)} onSubmit={(v) => guard(async () => { const t = rename; setRename(null); await P.audio.update(t.id, { label: v }); onChanged?.(); })} />
      <RecorderDialog open={recording} onClose={() => setRecording(false)} onTake={addTake} bpm={bpm} signature={signature} />
      {publish && <PublishDialog open onClose={() => setPublish(null)} takes={takes} initialId={publish} defaultTitle={entity.title} onPublished={() => onChanged?.()} />}
    </div>
  );
}

function TakeNotes({ take, onSaved }) {
  const { P } = useAuthor();
  const [value, setValue] = useState(take.notes || '');
  const [state, setState] = useState('');
  const save = async () => {
    if (value === (take.notes || '')) return;
    setState('…');
    try { await P.audio.update(take.id, { notes: value }); setState('✓'); onSaved?.(); } catch { setState('⚠ non enregistré'); }
  };
  return (
    <label className="au-field" style={{ display: 'block', marginTop: 12, marginBottom: 0 }}>
      <span className="au-field-label" style={{ display: 'block' }}>Notes sur cette prise <span className="au-faint">{state}</span></span>
      <textarea className="au-textarea" rows={2} value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} maxLength={20000}
        placeholder="Ce qui marche, ce qui est à refaire…" />
    </label>
  );
}
