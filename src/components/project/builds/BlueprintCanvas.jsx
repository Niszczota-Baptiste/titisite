import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { muted } from '../shared';

const BlueprintScene = lazy(() => import('./BlueprintScene'));

const SPEED_KEY = 'we_cam_speed';
const readSpeed = () => {
  const v = Number(localStorage.getItem(SPEED_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0.5;
};

// Visionneuse 3D réutilisable (membres + page partagée) : canvas lazy + slider de
// couche Y + vitesse caméra + bouton plein écran. `data` = sparse
// {palette,min,size,blocks}, `codex` = map blockCodex. En mode `fillHeight`, la
// vue 3D occupe toute la hauteur disponible (plein écran).
export function BlueprintCanvas({
  data, codex, height = 480, selection, onPick, pickEnabled, yLimits,
  fillHeight = false, fullscreen = false, onToggleFullscreen, onBrush = null,
}) {
  const maxLayer = data.size.y - 1;
  const [layer, setLayer] = useState(maxLayer);
  const [mode, setMode] = useState('cumulative');
  const [speed, setSpeed] = useState(readSpeed);

  // Options de rendu (vague 5).
  const bounds = useMemo(() => {
    const m = data.min || { x: 0, y: 0, z: 0 };
    return {
      minX: m.x, maxX: m.x + data.size.x - 1,
      minZ: m.z, maxZ: m.z + data.size.z - 1,
    };
  }, [data]);
  const [chunkGrid, setChunkGrid] = useState(false);
  const [shadows, setShadows] = useState(false);
  const [measure, setMeasure] = useState(false);
  const [measured, setMeasured] = useState(null);
  const [cut, setCut] = useState(false);
  const [cutX, setCutX] = useState(bounds.maxX);
  const [cutZ, setCutZ] = useState(bounds.maxZ);
  const captureRef = useRef(null);

  // Pinceau interactif (clic dans la vue 3D) — uniquement si onBrush fourni.
  const [brushOn, setBrushOn] = useState(false);
  const [brushRadius, setBrushRadius] = useState(3);
  const [brushMode, setBrushMode] = useState('paint'); // paint | erase | smooth
  const [brushBlock, setBrushBlock] = useState('minecraft:stone');
  const brushParams = { radius: brushRadius, mode: brushMode, block: brushBlock };
  const handleBrush = (coord) => onBrush?.(coord, brushParams);

  // Réinitialise les bornes de coupe quand le build change.
  useEffect(() => { setCutX(bounds.maxX); setCutZ(bounds.maxZ); setCut(false); setMeasured(null); }, [bounds]);
  useEffect(() => { if (!measure) setMeasured(null); }, [measure]);

  const clip = cut ? { xmin: bounds.minX, xmax: cutX, zmin: bounds.minZ, zmax: cutZ } : null;

  useEffect(() => { localStorage.setItem(SPEED_KEY, String(speed)); }, [speed]);

  const exportImage = () => {
    const url = captureRef.current?.();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = 'build.png';
    a.click();
  };

  const boxStyle = fillHeight
    ? { position: 'relative', flex: 1, minHeight: 0, background: '#0d0a1c', overflow: 'hidden' }
    : { position: 'relative', height, background: '#0d0a1c', borderRadius: 12, overflow: 'hidden' };

  return (
    <div style={fillHeight ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined}>
      <div style={boxStyle}>
        <Suspense fallback={<div style={{ ...muted, padding: 16 }}>Chargement du moteur 3D…</div>}>
          {codex && <BlueprintScene data={data} codex={codex} layer={layer} layerMode={mode}
            selection={selection} onPick={onPick} pickEnabled={pickEnabled} moveSpeed={speed} yLimits={yLimits}
            chunkGrid={chunkGrid} shadows={shadows} clip={clip} measure={measure}
            captureRef={captureRef} onMeasure={setMeasured}
            brush={!!onBrush && brushOn} onBrush={handleBrush} />}
        </Suspense>
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            style={fsBtn}>{fullscreen ? '⛶ Quitter' : '⛶ Plein écran'}</button>
        )}
        {measure && (
          <div style={measureBox}>
            {measured
              ? <>📐 <strong>{measured.dx}×{measured.dy}×{measured.dz}</strong> · diag {measured.dist.toFixed(1)} · {measured.blocks.toLocaleString('fr-FR')} blocs</>
              : <>📐 Clic gauche sur deux blocs pour mesurer</>}
          </div>
        )}
      </div>
      <div style={{ ...muted, fontSize: 12, padding: '8px 14px 0' }}>
        {pickEnabled && <><strong style={{ color: '#ffd24a' }}>Clic droit</strong> = coin A · <strong style={{ color: '#ffd24a' }}>clic gauche</strong> = coin B · </>}
        <strong>ZQSD/WASD</strong> = caméra (R/F = haut/bas) · glisser = pivoter · molette = zoom
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['cumulative', 'Jusqu\'à la couche'], ['single', 'Couche seule']].map(([m, lbl]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
                background: mode === m ? 'rgba(201,168,232,0.2)' : 'transparent',
                border: `1px solid ${mode === m ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`,
                color: mode === m ? '#c9a8e8' : '#ede8f8',
              }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
          <span style={{ ...muted, fontSize: 12, whiteSpace: 'nowrap' }}>Y = {layer}</span>
          <input type="range" min={0} max={maxLayer} value={layer}
            onChange={(e) => setLayer(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#c9a8e8' }} />
          <button type="button" onClick={() => setLayer(maxLayer)}
            style={{ padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: '#ede8f8' }}>
            Tout
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Sensibilité du déplacement ZQSD/RF">
          <span style={{ ...muted, fontSize: 12, whiteSpace: 'nowrap' }}>🎮 Vitesse</span>
          <input type="range" min={0.1} max={2} step={0.05} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 110, accentColor: '#c9a8e8' }} />
          <span style={{ ...muted, fontSize: 11, width: 28 }}>{speed.toFixed(2)}</span>
        </div>
      </div>
      {/* Vague 5 : grille de chunks, ombres, mesure, coupe, export image */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 14px 14px' }}>
        <Toggle on={chunkGrid} onClick={() => setChunkGrid((v) => !v)}>▦ Grille chunks</Toggle>
        <Toggle on={shadows} onClick={() => setShadows((v) => !v)}>☀️ Ombres</Toggle>
        <Toggle on={measure} onClick={() => setMeasure((v) => !v)}>📐 Mesurer</Toggle>
        <Toggle on={cut} onClick={() => setCut((v) => !v)}>✂️ Coupe</Toggle>
        <button type="button" onClick={exportImage} style={ghostBtn}>🖼️ Exporter image</button>
        {cut && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...muted, fontSize: 12 }}>X ≤ {cutX}</span>
            <input type="range" min={bounds.minX} max={bounds.maxX} value={cutX}
              onChange={(e) => setCutX(Number(e.target.value))} style={{ width: 120, accentColor: '#c9a8e8' }} />
            <span style={{ ...muted, fontSize: 12 }}>Z ≤ {cutZ}</span>
            <input type="range" min={bounds.minZ} max={bounds.maxZ} value={cutZ}
              onChange={(e) => setCutZ(Number(e.target.value))} style={{ width: 120, accentColor: '#c9a8e8' }} />
          </div>
        )}
      </div>

      {/* Vague 7 : pinceau interactif (clic dans la vue) — seulement en édition */}
      {onBrush && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '0 14px 14px' }}>
          <Toggle on={brushOn} onClick={() => setBrushOn((v) => !v)}>🖌️ Pinceau</Toggle>
          {brushOn && (
            <>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['paint', 'Peindre'], ['erase', 'Effacer'], ['smooth', 'Lisser']].map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setBrushMode(m)}
                    style={{
                      padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: "'Inter',sans-serif",
                      background: brushMode === m ? 'rgba(201,168,232,0.2)' : 'transparent',
                      border: `1px solid ${brushMode === m ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`, color: '#ede8f8',
                    }}>{lbl}</button>
                ))}
              </div>
              <span style={{ ...muted, fontSize: 12 }}>Rayon {brushRadius}</span>
              <input type="range" min={1} max={12} value={brushRadius} onChange={(e) => setBrushRadius(Number(e.target.value))} style={{ width: 100, accentColor: '#c9a8e8' }} />
              {brushMode === 'paint' && (
                <input value={brushBlock} onChange={(e) => setBrushBlock(e.target.value.trim().toLowerCase())}
                  placeholder="minecraft:stone" aria-label="bloc du pinceau"
                  style={{ width: 170, background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8, padding: '6px 10px', color: '#ede8f8', fontSize: 13 }} />
              )}
              <span style={{ ...muted, fontSize: 11 }}>← clique dans la vue 3D pour appliquer</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
        background: on ? 'rgba(201,168,232,0.2)' : 'transparent',
        border: `1px solid ${on ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`,
        color: on ? '#c9a8e8' : '#ede8f8',
      }}>{children}</button>
  );
}

const ghostBtn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
  background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: '#ede8f8',
};

const measureBox = {
  position: 'absolute', left: 10, bottom: 10, zIndex: 3,
  padding: '6px 12px', borderRadius: 8, fontSize: 12, color: '#ede8f8',
  background: 'rgba(13,10,28,0.78)', border: '1px solid rgba(74,222,128,0.5)',
  fontFamily: "'Inter',sans-serif", backdropFilter: 'blur(3px)',
};

const fsBtn = {
  position: 'absolute', top: 10, right: 10, zIndex: 3,
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  background: 'rgba(13,10,28,0.7)', border: '1px solid rgba(80,50,130,0.5)', color: '#ede8f8',
  fontFamily: "'Space Grotesk',sans-serif", backdropFilter: 'blur(3px)',
};
