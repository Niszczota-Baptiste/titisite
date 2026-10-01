import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { IMAGE_ACCEPT, useUpload } from './MediaPanel';
import { Btn, ColorDots, Dialog, EntityPicker, ErrorLine, Field, KindAvatar, cx, entityPath, humanError } from './ui';

// Carte d'un lieu : une image (carte dessinée, plan, capture) et des points
// cliquables posés dessus, chacun pouvant mener à un autre élément (une ville
// sur la carte du royaume, une taverne sur le plan de la ville…). Positions en
// fractions de l'image : indépendantes de sa taille d'affichage.

export function PlaceMap({ place, onChanged }) {
  const { pid, P, search } = useAuthor();
  const toast = useToast();
  const confirm = useConfirm();
  const { upload, progress } = useUpload();
  const input = useRef(null);
  const wrap = useRef(null);
  const [pins, setPins] = useState([]);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(null); // { x, y, id?, label, color, target }
  const [openPin, setOpenPin] = useState(null);
  const [error, setError] = useState(null);
  const [big, setBig] = useState(false);
  const drag = useRef(null);

  const load = useCallback(() => P.pins.list(place.id).then(setPins).catch(setError), [P, place.id]);
  useEffect(() => { load(); }, [load]);

  const onFiles = async (files) => {
    if (!files?.length) return;
    const done = await upload([files[0]], { entityId: place.id, purpose: 'map' });
    if (done.length) onChanged?.();
  };

  const posFromEvent = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onMapClick = (e) => {
    if (!edit || drag.current?.moved) return;
    if (e.target.closest('.au-pin')) return;
    const p = posFromEvent(e);
    setDraft({ ...p, label: '', color: '#e8c86a', target: null });
  };

  // Déplacer un point en mode édition (souris ou doigt).
  const onPinDown = (e, pin) => {
    if (!edit) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { pin, moved: false };
  };
  const onPinMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = posFromEvent(e);
    d.moved = true;
    d.pos = p;
    setPins((list) => list.map((x) => (x.id === d.pin.id ? { ...x, ...p } : x)));
  };
  const onPinUp = async () => {
    const d = drag.current;
    setTimeout(() => { drag.current = null; }, 0);
    if (!d) return;
    if (!d.moved) { setDraft({ ...d.pin, target: d.pin.target }); return; }
    try { await P.pins.update(d.pin.id, d.pos); } catch (err) { toast.error(humanError(err)); load(); }
  };

  const savePin = async () => {
    const body = { x: draft.x, y: draft.y, label: draft.label.trim(), color: draft.color, targetId: draft.target?.id ?? null };
    try {
      if (draft.id) await P.pins.update(draft.id, body);
      else await P.pins.create(place.id, body);
      setDraft(null);
      load();
    } catch (err) { setError(err); }
  };
  const deletePin = async () => {
    if (!(await confirm({ title: 'Supprimer ce point ?', confirmLabel: 'Supprimer', danger: true }))) return;
    await P.pins.remove(draft.id);
    setDraft(null);
    load();
  };

  const map = place.map;
  const canvas = (fullscreen) => (
    <div ref={fullscreen === big ? wrap : undefined} className={cx('au-map', edit && 'is-edit')} onClick={onMapClick}
      onPointerMove={onPinMove} onPointerUp={onPinUp}>
      <img src={map.url} alt={`Carte — ${place.title}`} draggable={false} />
      {pins.map((pin) => (
        <button key={pin.id} type="button" className={cx('au-pin', openPin === pin.id && 'is-open')}
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, '--pin': pin.color }}
          onPointerDown={(e) => onPinDown(e, pin)}
          onClick={(e) => { e.stopPropagation(); if (!edit) setOpenPin(openPin === pin.id ? null : pin.id); }}
          aria-label={pin.label || pin.target?.title || 'Point'}>
          <span className="au-pin-dot" />
          {(pin.label || pin.target) && <span className="au-pin-label">{pin.label || pin.target.title}</span>}
          {openPin === pin.id && !edit && pin.target && (
            <span className="au-pin-pop" onClick={(e) => e.stopPropagation()}>
              <Link to={entityPath(pid, pin.target)}>{pin.target.icon} Ouvrir « {pin.target.title} » →</Link>
            </span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="au-card-title">
        🗺️ Carte
        <span className="au-actions">
          {map && <Btn size="small" on={edit} onClick={() => setEdit((v) => !v)}>{edit ? '✓ Terminer' : '📍 Placer des points'}</Btn>}
          {map && <Btn size="small" variant="ghost" icon onClick={() => setBig(true)} aria-label="Agrandir" title="Agrandir">⤢</Btn>}
          <Btn size="small" variant="ghost" onClick={() => input.current?.click()} disabled={progress !== null}>
            {progress !== null ? `${Math.round(progress * 100)} %` : map ? 'Changer l\'image' : '＋ Image de carte'}
          </Btn>
        </span>
      </div>
      <input ref={input} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <ErrorLine error={error} onClose={() => setError(null)} />
      {!map ? (
        <div className="au-dropzone" role="button" tabIndex={0} onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter') input.current?.click(); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
          Ajoute une carte (dessin, plan, capture) puis place des points cliquables dessus.
        </div>
      ) : (
        <>
          {!big && canvas(false)}
          {edit && <p className="au-faint" style={{ fontSize: 12, marginTop: 6 }}>Clique sur la carte pour poser un point ; fais glisser un point pour le déplacer ; clique dessus pour le modifier.</p>}
        </>
      )}
      <Dialog open={big} onClose={() => setBig(false)} title={`🗺️ ${place.title}`} width={1400}>
        {map && big && canvas(true)}
      </Dialog>
      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Modifier le point' : 'Nouveau point'} width={520}
        footer={(
          <>
            {draft?.id && <Btn variant="danger" onClick={deletePin} style={{ marginRight: 'auto' }}>Supprimer</Btn>}
            <Btn variant="ghost" onClick={() => setDraft(null)}>Annuler</Btn>
            <Btn variant="primary" onClick={savePin}>Enregistrer</Btn>
          </>
        )}>
        {draft && (
          <>
            <Field label="Libellé">
              <input className="au-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={120} data-autofocus />
            </Field>
            <Field label="Couleur"><ColorDots value={draft.color} onChange={(c) => setDraft({ ...draft, color: c })} /></Field>
            <Field label="Mène à (facultatif)">
              {draft.target ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KindAvatar entity={draft.target} /><span className="au-row-title">{draft.target.title}</span>
                  <Btn size="small" variant="ghost" onClick={() => setDraft({ ...draft, target: null })}>Retirer</Btn>
                </div>
              ) : (
                <EntityPicker search={search} exclude={[place.id]} autoFocus={false}
                  onPick={(t) => setDraft((d) => ({ ...d, target: t, label: d.label || t.title }))} />
              )}
            </Field>
          </>
        )}
      </Dialog>
    </div>
  );
}
