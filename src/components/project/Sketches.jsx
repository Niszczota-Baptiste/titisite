import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { ImageUploadField } from '../admin/ImageUploadField';
import { Button, Empty, ErrorBanner, Modal, Section, card, muted, relativeDate } from './shared';

// « ✏️ Schémas » : des croquis libres pour expliquer les plans à deux — un
// dessin vectoriel (traits) au-dessus d'une capture d'écran ou d'une feuille
// blanche. Les traits sont stockés en fractions 0..1 (indépendants de la taille
// d'affichage) : { color, width, points:[x0,y0,x1,y1,…] }.

const PALETTE = ['#ff4d4d', '#ffd23f', '#4ade80', '#60a5fa', '#c084fc', '#ffffff', '#111827'];
const WIDTHS = [2, 4, 8, 14];

export function SketchesTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const toast = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // sketch (full) | 'new' | null

  const load = () => {
    setLoading(true);
    ws.minecraft.sketches.list()
      .then(setList)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const openNew = () => setEditing('new');
  const openEdit = async (s) => {
    try { setEditing(await ws.minecraft.sketches.get(s.id)); }
    catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  const remove = async (s) => {
    const ok = await confirm({
      title: `Supprimer « ${s.title} »`, danger: true, confirmLabel: 'Supprimer',
      message: 'Ce schéma sera supprimé définitivement.',
    });
    if (!ok) return;
    try { await ws.minecraft.sketches.remove(s.id); setList((prev) => prev.filter((x) => x.id !== s.id)); toast.success('Schéma supprimé'); }
    catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  return (
    <Section title="✏️ Schémas de la base" actions={<Button onClick={openNew}>+ Schéma</Button>}>
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />
      <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        Des croquis pour expliquer les plans à deux — dessine sur une capture
        d'écran ou une feuille blanche.
      </p>

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : list.length === 0 ? (
        <Empty>Aucun schéma. Clique « + Schéma » pour croquer un plan (base, ferme, tri…).</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {list.map((s) => (
            <div key={s.id} style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button type="button" onClick={() => openEdit(s)}
                style={{
                  border: 'none', padding: 0, cursor: 'pointer', background: s.backgroundUrl ? '#000' : '#f4f1ea',
                  aspectRatio: '4/3', display: 'block', width: '100%',
                }}
                title="Ouvrir le schéma"
              >
                {s.backgroundUrl ? (
                  <img src={s.backgroundUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 28 }}>✏️</div>
                )}
              </button>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ flex: 1, minWidth: 0, color: '#ede8f8', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </strong>
                  <button type="button" onClick={() => remove(s)} title="Supprimer"
                    style={{ background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)', color: '#f87171', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: 12 }}>
                    🗑️
                  </button>
                </div>
                {s.note && <div style={{ ...muted, fontSize: 11.5 }}>{s.note}</div>}
                <div style={{ ...muted, fontSize: 11 }}>
                  {s.createdByName ? `par ${s.createdByName} · ` : ''}{relativeDate(s.updatedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SketchEditor
          sketch={editing === 'new' ? null : editing}
          ws={ws} toast={toast}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </Section>
  );
}

// Éditeur plein-écran : canvas de dessin (traits), fond capture/feuille, palette
// de couleurs, épaisseurs, gomme, annuler, effacer tout.
function SketchEditor({ sketch, ws, toast, onClose, onSaved }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(null); // trait en cours

  const [title, setTitle] = useState(sketch?.title || '');
  const [note, setNote] = useState(sketch?.note || '');
  const [backgroundUrl, setBackgroundUrl] = useState(sketch?.backgroundUrl || '');
  const [strokes, setStrokes] = useState(sketch?.strokes || []);
  const [color, setColor] = useState('#ff4d4d');
  const [width, setWidth] = useState(4);
  const [eraser, setEraser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [bgDim, setBgDim] = useState(null);

  // Redessine tous les traits (coordonnées en fraction → pixels).
  const redraw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) drawStroke(ctx, s, cv.width, cv.height);
    if (drawing.current) drawStroke(ctx, drawing.current, cv.width, cv.height);
  };

  // Dimensionne le canvas à son conteneur (aspect selon le fond, sinon 4/3).
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return undefined;
    const resize = () => {
      const w = wrap.clientWidth;
      const aspect = bgDim ? bgDim.h / bgDim.w : 3 / 4;
      cv.width = w;
      cv.height = Math.round(w * aspect);
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line
  }, [bgDim]);

  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, [strokes]);

  const ptAt = (e) => {
    const cv = canvasRef.current;
    const r = cv.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [clamp01(cx / r.width), clamp01(cy / r.height)];
  };

  const start = (e) => {
    e.preventDefault();
    const [x, y] = ptAt(e);
    // Gomme = trait de la couleur du fond « papier » (blanc) plus large ; sur un
    // fond image on efface en repassant en semi-transparent sombre translucide.
    drawing.current = { color: eraser ? '__erase__' : color, width: eraser ? width * 2.5 : width, points: [x, y] };
    redraw();
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const [x, y] = ptAt(e);
    drawing.current.points.push(x, y);
    redraw();
  };
  const end = () => {
    if (!drawing.current) return;
    if (drawing.current.color === '__erase__') {
      // La gomme retire les traits proches de son tracé au lieu de peindre.
      const erasePts = drawing.current.points;
      const rad = drawing.current.width / 2 / (canvasRef.current?.width || 1);
      setStrokes((prev) => prev.filter((s) => !strokeHitByEraser(s, erasePts, Math.max(0.01, rad))));
    } else if (drawing.current.points.length >= 4) {
      setStrokes((prev) => [...prev, drawing.current]);
    }
    drawing.current = null;
    redraw();
  };

  const undo = () => setStrokes((prev) => prev.slice(0, -1));
  const clearAll = () => setStrokes([]);

  const save = async () => {
    if (!title.trim()) { setErr('Donne un titre au schéma.'); return; }
    setSaving(true); setErr(null);
    try {
      const body = { title: title.trim(), note: note.trim(), backgroundFilename: backgroundUrl || null, strokes };
      if (sketch) await ws.minecraft.sketches.update(sketch.id, body);
      else await ws.minecraft.sketches.create(body);
      toast.success(sketch ? 'Schéma mis à jour' : 'Schéma créé');
      onSaved();
    } catch (e) { setErr(e.message || 'Enregistrement impossible'); setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={sketch ? 'Modifier le schéma' : 'Nouveau schéma'} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && <p style={{ color: '#ff8a9b', fontSize: 12.5, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (ex. Plan du tri auto)"
            style={{ ...inp, flex: '2 1 220px' }} autoFocus />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)"
            style={{ ...inp, flex: '2 1 220px' }} />
        </div>

        {/* Barre d'outils de dessin */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => { setColor(c); setEraser(false); }}
              title={c} style={{
                width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', background: c,
                border: (!eraser && color === c) ? '3px solid #ede8f8' : '1px solid rgba(255,255,255,0.3)',
              }} />
          ))}
          <span style={{ width: 1, height: 22, background: 'rgba(120,90,180,0.3)' }} />
          {WIDTHS.map((w) => (
            <button key={w} type="button" onClick={() => setWidth(w)}
              title={`Épaisseur ${w}`} style={{
                width: 30, height: 26, borderRadius: 6, cursor: 'pointer',
                background: width === w ? 'rgba(201,168,232,0.2)' : 'rgba(20,14,38,0.7)',
                border: `1px solid ${width === w ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <span style={{ width: w + 2, height: w + 2, borderRadius: '50%', background: '#ede8f8' }} />
            </button>
          ))}
          <span style={{ width: 1, height: 22, background: 'rgba(120,90,180,0.3)' }} />
          <TBtn active={eraser} onClick={() => setEraser((v) => !v)}>🧽 Gomme</TBtn>
          <TBtn onClick={undo} disabled={strokes.length === 0}>↶ Annuler</TBtn>
          <TBtn onClick={clearAll} disabled={strokes.length === 0}>Effacer tout</TBtn>
          <span style={{ ...muted, fontSize: 11.5, marginLeft: 'auto' }}>{strokes.length} trait{strokes.length > 1 ? 's' : ''}</span>
        </div>

        {/* Zone de dessin */}
        <div ref={wrapRef} style={{
          position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden',
          border: '1px solid rgba(80,50,130,0.3)', background: backgroundUrl ? '#000' : '#f4f1ea',
          touchAction: 'none',
        }}>
          {backgroundUrl && (
            <img src={backgroundUrl} alt="" draggable={false}
              onLoad={(e) => setBgDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
          )}
          <canvas
            ref={canvasRef}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{ position: 'relative', display: 'block', width: '100%', cursor: eraser ? 'cell' : 'crosshair' }}
          />
        </div>

        {/* Fond : capture ou feuille blanche */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px' }}>
            <ImageUploadField
              label="Fond : capture d'écran (sinon feuille blanche)"
              value={backgroundUrl}
              onChange={(url) => { setBackgroundUrl(url || ''); if (!url) setBgDim(null); }}
              aspect="4/3"
              uploadFn={(file) => ws.minecraft.uploadImage(file)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={save} disabled={saving || !title.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Trace un trait sur le contexte 2D. La gomme est déjà appliquée au moment du
// relâché (retrait des traits), donc ici on ne peint jamais « __erase__ » en dur
// — sauf pendant le geste en cours, où on l'affiche en surbrillance translucide.
function drawStroke(ctx, s, w, h) {
  const pts = s.points;
  if (pts.length < 2) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.color === '__erase__') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = s.width;
    ctx.setLineDash([4, 4]);
  } else {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0] * w, pts[1] * h);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * w, pts[i + 1] * h);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Un trait est « touché » par la gomme si l'un de ses points est proche (en
// distance fractionnaire) d'un point du tracé de gomme.
function strokeHitByEraser(stroke, erasePts, rad) {
  for (let i = 0; i < stroke.points.length; i += 2) {
    const sx = stroke.points[i]; const sy = stroke.points[i + 1];
    for (let j = 0; j < erasePts.length; j += 2) {
      const dx = sx - erasePts[j]; const dy = sy - erasePts[j + 1];
      if (dx * dx + dy * dy <= rad * rad) return true;
    }
  }
  return false;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function TBtn({ children, onClick, active, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: '6px 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600,
      background: active ? 'rgba(201,168,232,0.2)' : 'rgba(20,14,38,0.7)',
      color: disabled ? 'rgba(180,170,200,0.35)' : (active ? '#c9a8e8' : '#ede8f8'),
      border: `1px solid ${active ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
    }}>{children}</button>
  );
}

const inp = {
  boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};
