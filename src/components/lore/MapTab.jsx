import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { LoreMap, SHAPES } from './LoreMap';
import {
  ACC, ACC_RGB, CRIMSON, DIMENSIONS, ENTRY_TYPES, ENTRY_TYPE_ORDER, GOLD, INK,
  MUTED, hexToRgb, panel,
} from './theme';

// Onglet 🗺 Carte : données + modes (origine / mesure), filtres par type,
// table des relèvements du mode origine (triée par angle, alignements ±tolérance
// surlignés — servie par GET /api/lore/geo/ring, aucune trigonométrie côté
// client), et le panneau de calibration du render.

const SHAPE_COLORS = ['#e8c86a', '#7bd3e8', '#7be3a8', '#e0526f', '#b79bff', '#f0ede5'];

export function MapTab({ onOpenEntry, onCreateAt, refreshKey = 0 }) {
  const [points, setPoints] = useState([]);
  const [maps, setMaps] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [hiddenShapes, setHiddenShapes] = useState(() => new Set());
  const [dimension, setDimension] = useState('overworld');
  const [types, setTypes] = useState(() => new Set(ENTRY_TYPE_ORDER));
  const [mode, setMode] = useState('pan'); // 'pan' | 'origin' | 'measure' | 'add' | 'draw'
  const [origin, setOrigin] = useState(null);
  const [tolerance, setTolerance] = useState(2);
  const [ring, setRing] = useState(null);
  const [measure, setMeasure] = useState({ a: null, b: null });
  const [draft, setDraft] = useState(null); // tracé en cours { points, name, color, closed }
  const [err, setErr] = useState(null);
  // La carte n'est montée qu'une fois les points chargés : sa vue initiale est
  // cadrée sur eux au mount — la monter vide la laisserait centrée sur 0,0.
  const [loaded, setLoaded] = useState(false);

  const load = () => Promise.all([api.lore.mapPoints(), api.lore.maps.list(), api.lore.shapes.list()])
    .then(([pts, mp, sh]) => { setPoints(pts); setMaps(mp); setShapes(sh); setLoaded(true); })
    .catch((e) => setErr(e.message));
  // refreshKey bouge quand une entrée est créée/modifiée ailleurs sur la page
  // (fiche, éditeur) — la carte suit sans re-navigation.
  useEffect(() => { load(); }, [refreshKey]);

  // Le calcul du relèvement de chaque point vit côté serveur (source de
  // vérité unique server/lore/geo.js) : une requête par choix d'origine.
  useEffect(() => {
    if (!origin) { setRing(null); return undefined; }
    let alive = true;
    api.lore.ring(origin.x, origin.z, { tolerance, dimension })
      .then((r) => { if (alive) setRing(r.points); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [origin, tolerance, dimension]);

  const dimPoints = points.filter((p) => p.dimension === dimension);
  const shown = dimPoints.filter((p) => types.has(p.entryType));
  const map = maps.find((m) => m.dimension === dimension) || null;

  const toggleType = (t) => setTypes((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t); else n.add(t);
    return n;
  });

  const onMeasureClick = (pt) => setMeasure((m) => ((!m.a || m.b) ? { a: pt, b: null } : { a: m.a, b: pt }));

  // ➕ Point : le clic délègue à la page l'ouverture de l'éditeur pré-rempli.
  const onAddAt = (pt) => {
    setMode('pan');
    onCreateAt?.({ x: pt.x, z: pt.z, dimension });
  };

  // ✏️ Tracé : chaque clic ajoute un sommet (accroché au marqueur cliqué).
  const onDrawClick = (pt) => setDraft((d) => (d ? { ...d, points: [...d.points, [pt.x, pt.z]] } : d));
  const startDraw = () => {
    if (mode === 'draw') { setMode('pan'); setDraft(null); return; }
    setMode('draw');
    setDraft({ points: [], name: '', color: SHAPE_COLORS[0], closed: false });
  };
  const saveDraft = async () => {
    if (!draft || draft.points.length < 2) return;
    try {
      await api.lore.shapes.create({
        dimension, name: draft.name.trim(), color: draft.color,
        closed: draft.closed, points: draft.points,
      });
      setDraft(null);
      setMode('pan');
      await load();
    } catch (ex) { setErr(ex.message); }
  };
  const deleteShape = async (s) => {
    // eslint-disable-next-line no-alert -- suppression d'un tracé partagé, confirmation volontaire
    if (!window.confirm(`Supprimer le tracé « ${s.name || `#${s.id}`} » ?`)) return;
    try { await api.lore.shapes.remove(s.id); await load(); } catch (ex) { setErr(ex.message); }
  };

  const dimShapes = shapes.filter((s) => s.dimension === dimension);
  const visibleShapes = dimShapes.filter((s) => !hiddenShapes.has(s.id));

  return (
    <div>
      {err && (
        <div style={{ background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
          {err} <button type="button" onClick={() => setErr(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ff8a9b', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* dimension + modes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {Object.entries(DIMENSIONS).map(([k, d]) => {
          const n = points.filter((p) => p.dimension === k).length;
          const on = dimension === k;
          return (
            <button key={k} type="button" onClick={() => { setDimension(k); setOrigin(null); setMeasure({ a: null, b: null }); }}
              style={{
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                fontSize: 13, fontWeight: 600, background: on ? ACC : 'transparent',
                color: on ? '#06130b' : MUTED, border: on ? 'none' : `1px solid rgba(${ACC_RGB},0.3)`,
              }}
            >{d.icon} {d.label} ({n})</button>
          );
        })}

        <span style={{ width: 1, height: 22, background: 'rgba(90,160,120,0.3)', margin: '0 4px' }} />

        <ModeBtn on={mode === 'origin'} color={GOLD} onClick={() => setMode((m) => (m === 'origin' ? 'pan' : 'origin'))}>
          🧭 Mode origine
        </ModeBtn>
        {origin && (
          <>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: GOLD }}>
              origine X {origin.x} / Z {origin.z}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
              ±
              <input
                type="number" min="0" max="45" step="0.5" value={tolerance}
                onChange={(e) => setTolerance(Math.min(45, Math.max(0, Number(e.target.value) || 0)))}
                style={{
                  width: 52, padding: '4px 6px', borderRadius: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
                  background: 'rgba(9,16,14,0.7)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
                }}
              />°
            </label>
            <button type="button" onClick={() => setOrigin(null)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}>
              ✕ effacer
            </button>
          </>
        )}
        <ModeBtn on={mode === 'measure'} color="#7bd3e8" onClick={() => setMode((m) => { if (m === 'measure') { setMeasure({ a: null, b: null }); return 'pan'; } return 'measure'; })}>
          📏 Mesurer
        </ModeBtn>
        <ModeBtn on={mode === 'add'} color={ACC} onClick={() => setMode((m) => (m === 'add' ? 'pan' : 'add'))}>
          ➕ Point
        </ModeBtn>
        <ModeBtn on={mode === 'draw'} color="#b79bff" onClick={startDraw}>
          ✏️ Tracé
        </ModeBtn>
      </div>

      {/* panneau du tracé en cours */}
      {mode === 'draw' && draft && (
        <div style={{ ...panel, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '9px 12px', marginBottom: 8, fontFamily: "'Inter',sans-serif" }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: '#b79bff' }}>
            ✏️ {draft.points.length} sommet{draft.points.length > 1 ? 's' : ''}
          </span>
          <input
            value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nom du tracé (Étoile des tours…)" maxLength={120}
            style={{
              flex: '1 1 180px', padding: '6px 10px', borderRadius: 7, fontSize: 12.5,
              background: 'rgba(9,16,14,0.7)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
            }}
          />
          {SHAPE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, color: c }))} title={c}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer',
                border: draft.color === c ? '2px solid #fff' : '2px solid transparent', padding: 0,
              }} />
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.closed} onChange={(e) => setDraft((d) => ({ ...d, closed: e.target.checked }))}
              style={{ accentColor: '#b79bff', width: 14, height: 14 }} />
            fermer (polygone)
          </label>
          <button type="button" onClick={() => setDraft((d) => ({ ...d, points: d.points.slice(0, -1) }))}
            disabled={draft.points.length === 0} title="Retirer le dernier sommet"
            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, opacity: draft.points.length ? 1 : 0.4 }}>⌫</button>
          <button type="button" onClick={saveDraft} disabled={draft.points.length < 2} style={{
            padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            background: '#b79bff', color: '#120b1e', border: 'none', opacity: draft.points.length < 2 ? 0.45 : 1,
          }}>✔ Enregistrer</button>
          <button type="button" onClick={() => { setDraft(null); setMode('pan'); }}
            style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12.5 }}>✕ annuler</button>
        </div>
      )}

      {/* légende / filtre par type */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {ENTRY_TYPE_ORDER.map((t) => {
          const meta = ENTRY_TYPES[t];
          const n = dimPoints.filter((p) => p.entryType === t).length;
          const on = types.has(t);
          return (
            <button key={t} type="button" onClick={() => toggleType(t)} title={`${on ? 'Masquer' : 'Afficher'} : ${meta.label}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 11.5, fontWeight: 600,
                color: on ? meta.color : MUTED, opacity: on ? 1 : 0.45,
                background: on ? `rgba(${hexToRgb(meta.color)},0.1)` : 'transparent',
                border: `1px solid rgba(${hexToRgb(meta.color)},${on ? 0.5 : 0.25})`,
              }}
            >
              <ShapeDot type={t} color={meta.color} />
              {meta.label} ({n})
            </button>
          );
        })}
      </div>

      {loaded ? (
        <LoreMap
          key={dimension}
          points={shown} map={map} mode={mode} origin={origin} onSetOrigin={setOrigin}
          ring={ring} tolerance={tolerance} measure={measure} onMeasureClick={onMeasureClick}
          onOpenEntry={onOpenEntry} onAddAt={onAddAt} onDrawClick={onDrawClick}
          shapes={visibleShapes} draft={mode === 'draw' ? draft : null}
        />
      ) : <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>Chargement de la carte…</p>}

      {/* tracés enregistrés : visibilité + suppression */}
      {dimShapes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED }}>✏️ Tracés :</span>
          {dimShapes.map((s) => {
            const hidden = hiddenShapes.has(s.id);
            return (
              <span key={s.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999,
                fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: hidden ? MUTED : s.color,
                background: hidden ? 'transparent' : `rgba(${hexToRgb(s.color)},0.1)`,
                border: `1px solid rgba(${hexToRgb(s.color)},${hidden ? 0.25 : 0.5})`, opacity: hidden ? 0.55 : 1,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: s.closed ? 2 : '50%', background: s.color }} />
                {s.name || `Tracé #${s.id}`} ({s.points.length})
                <button type="button" title={hidden ? 'Afficher' : 'Masquer'}
                  onClick={() => setHiddenShapes((h) => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 11 }}>
                  {hidden ? '🙈' : '👁'}
                </button>
                <button type="button" title="Supprimer" onClick={() => deleteShape(s)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 10.5 }}>✕</button>
              </span>
            );
          })}
        </div>
      )}

      {origin && ring && <RingTable ring={ring} onOpenEntry={onOpenEntry} />}

      <CalibrationPanel map={map} dimension={dimension} onChanged={load} setErr={setErr} />
    </div>
  );
}

// Relevés depuis l'origine, triés par angle — la version tableau de la rose :
// chaque entrée avec son cap, sa distance et son écart au plus proche des 8
// axes. Les alignements (±tolérance) sont surlignés.
function RingTable({ ring, onOpenEntry }) {
  return (
    <div style={{ ...panel, marginTop: 14, padding: '12px 14px', overflowX: 'auto' }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: INK, marginBottom: 8 }}>
        🧭 Relèvements ({ring.length} point{ring.length > 1 ? 's' : ''}, triés par angle)
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
        <thead>
          <tr style={{ color: MUTED, textAlign: 'left' }}>
            <th style={th}>Cap</th>
            <th style={th}>Entrée</th>
            <th style={{ ...th, textAlign: 'right' }}>Distance</th>
            <th style={{ ...th, textAlign: 'right' }}>Écart axe</th>
          </tr>
        </thead>
        <tbody>
          {ring.map((p) => {
            const meta = ENTRY_TYPES[p.entryType] || ENTRY_TYPES.observation;
            return (
              <tr key={p.id} style={{ background: p.aligned ? `rgba(${hexToRgb(GOLD)},0.09)` : 'transparent' }}>
                <td style={{ ...td, color: p.aligned ? GOLD : INK, fontWeight: p.aligned ? 700 : 400 }}>
                  {p.cardinal8} {String(Math.round(p.bearingDeg) % 360).padStart(3, '0')}°
                </td>
                <td style={td}>
                  <button type="button" onClick={() => onOpenEntry?.(p.id)} style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: ACC, font: 'inherit', borderBottom: `1px solid ${ACC}44`,
                  }}>{meta.icon} {p.title}</button>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{Math.round(p.distance)} blocs</td>
                <td style={{ ...td, textAlign: 'right', color: p.aligned ? GOLD : MUTED }}>
                  {p.aligned ? '◈ ' : ''}{p.deviationDeg > 0 ? '+' : ''}{p.deviationDeg.toFixed(1)}° / {p.nearestAxisCardinal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Fond de carte : nom, calibration deux points (X gauche / X droit / Z bas du
// render) et upload de l'image — replié par défaut, c'est de l'outillage.
function CalibrationPanel({ map, dimension, onChanged, setErr }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [xl, setXl] = useState('');
  const [xr, setXr] = useState('');
  const [zb, setZb] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(map?.name || '');
    setXl(map?.imgXLeft ?? '');
    setXr(map?.imgXRight ?? '');
    setZb(map?.imgZBottom ?? '');
  }, [map]);

  const num = (v) => (v === '' ? null : Math.round(Number(v)));

  const save = async () => {
    setBusy(true);
    try {
      const body = { name: name.trim() || `Carte ${dimension}`, dimension, imgXLeft: num(xl), imgXRight: num(xr), imgZBottom: num(zb) };
      if (map) await api.lore.maps.update(map.id, body);
      else await api.lore.maps.create(body);
      await onChanged();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const upload = async (file) => {
    if (!file || !map) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      await api.lore.maps.setImage(map.id, fd);
      await onChanged();
    } catch (ex) { setErr(ex.message === 'not_an_image' ? 'Ce fichier n\'est pas une image lisible.' : ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: MUTED, fontSize: 12.5, fontFamily: "'Inter',sans-serif", textDecoration: 'underline',
      }}>
        {open ? '▾' : '▸'} ⚙ Fond de carte ({DIMENSIONS[dimension].label}{map?.imageUrl ? ' — render en place' : ' — pas de render'})
      </button>
      {open && (
        <div style={{ ...panel, marginTop: 8, padding: '12px 14px', fontFamily: "'Inter',sans-serif" }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: MUTED }}>
            Calibration par deux points de référence du render : X du coin <strong>bas-gauche</strong>,
            X du coin <strong>bas-droit</strong>, et Z du <strong>bord bas</strong>. La hauteur se déduit
            du ratio de l'image. (Nostra : -5353 / 4646 / -636.)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <L label="Nom"><input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inp, width: 190 }} /></L>
            <L label="X bas-gauche"><input type="number" value={xl} onChange={(e) => setXl(e.target.value)} style={inp} /></L>
            <L label="X bas-droit"><input type="number" value={xr} onChange={(e) => setXr(e.target.value)} style={inp} /></L>
            <L label="Z bord bas"><input type="number" value={zb} onChange={(e) => setZb(e.target.value)} style={inp} /></L>
            <button type="button" onClick={save} disabled={busy} style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
              background: ACC, color: '#06130b', border: 'none', opacity: busy ? 0.5 : 1,
            }}>{map ? 'Enregistrer' : 'Créer la carte'}</button>
            {map && (
              <label style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                background: 'transparent', color: ACC, border: `1px solid rgba(${ACC_RGB},0.5)`,
              }}>
                🖼 {map.imageUrl ? 'Remplacer le render' : 'Uploader le render'}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
          {!map && <p style={{ margin: '8px 0 0', fontSize: 11.5, color: CRIMSON }}>Crée d'abord la carte, puis uploade le render.</p>}
        </div>
      )}
    </div>
  );
}

// Pastille de légende reprenant la vraie forme du marqueur.
function ShapeDot({ type, color }) {
  const shape = SHAPES[type] || 'circle';
  const s = { width: 9, height: 9, background: color, display: 'inline-block' };
  if (shape === 'diamond') s.transform = 'rotate(45deg)';
  else if (shape === 'circle') s.borderRadius = '50%';
  else if (shape === 'triangle') s.clipPath = 'polygon(50% 0%, 100% 100%, 0% 100%)';
  else if (shape === 'hexagon') s.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  else s.borderRadius = 2;
  return <span style={s} />;
}

function ModeBtn({ on, color, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 12.5, fontWeight: 700, color: on ? '#0b0d06' : color,
      background: on ? color : 'transparent', border: `1px solid ${color}`,
    }}>{children}</button>
  );
}

function L({ label, children }) {
  return (
    <label style={{ fontSize: 11, color: MUTED, display: 'grid', gap: 3 }}>
      {label}
      {children}
    </label>
  );
}

const inp = {
  width: 110, padding: '7px 9px', borderRadius: 7, fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
  background: 'rgba(9,16,14,0.7)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
};

const th = { padding: '4px 8px', fontWeight: 600, fontSize: 11 };
const td = { padding: '4px 8px', borderTop: '1px solid rgba(60,130,90,0.14)' };
