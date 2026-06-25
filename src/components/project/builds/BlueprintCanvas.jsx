import { lazy, Suspense, useEffect, useState } from 'react';
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
  fillHeight = false, fullscreen = false, onToggleFullscreen,
}) {
  const maxLayer = data.size.y - 1;
  const [layer, setLayer] = useState(maxLayer);
  const [mode, setMode] = useState('cumulative');
  const [speed, setSpeed] = useState(readSpeed);

  useEffect(() => { localStorage.setItem(SPEED_KEY, String(speed)); }, [speed]);

  const boxStyle = fillHeight
    ? { position: 'relative', flex: 1, minHeight: 0, background: '#0d0a1c', overflow: 'hidden' }
    : { position: 'relative', height, background: '#0d0a1c', borderRadius: 12, overflow: 'hidden' };

  return (
    <div style={fillHeight ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined}>
      <div style={boxStyle}>
        <Suspense fallback={<div style={{ ...muted, padding: 16 }}>Chargement du moteur 3D…</div>}>
          {codex && <BlueprintScene data={data} codex={codex} layer={layer} layerMode={mode}
            selection={selection} onPick={onPick} pickEnabled={pickEnabled} moveSpeed={speed} yLimits={yLimits} />}
        </Suspense>
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            style={fsBtn}>{fullscreen ? '⛶ Quitter' : '⛶ Plein écran'}</button>
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
    </div>
  );
}

const fsBtn = {
  position: 'absolute', top: 10, right: 10, zIndex: 3,
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
  background: 'rgba(13,10,28,0.7)', border: '1px solid rgba(80,50,130,0.5)', color: '#ede8f8',
  fontFamily: "'Space Grotesk',sans-serif", backdropFilter: 'blur(3px)',
};
