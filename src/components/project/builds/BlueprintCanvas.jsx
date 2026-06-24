import { lazy, Suspense, useState } from 'react';
import { muted } from '../shared';

const BlueprintScene = lazy(() => import('./BlueprintScene'));

// Visionneuse 3D réutilisable (membres + page partagée) : canvas lazy + slider de
// couche Y (cumulatif / couche seule). `data` = sparse {palette,min,size,blocks},
// `codex` = map blockCodex.
export function BlueprintCanvas({ data, codex, height = 480, selection, onPick, pickEnabled }) {
  const maxLayer = data.size.y - 1;
  const [layer, setLayer] = useState(maxLayer);
  const [mode, setMode] = useState('cumulative');

  return (
    <div>
      <div style={{ position: 'relative', height, background: '#0d0a1c', borderRadius: 12, overflow: 'hidden' }}>
        <Suspense fallback={<div style={{ ...muted, padding: 16 }}>Chargement du moteur 3D…</div>}>
          {codex && <BlueprintScene data={data} codex={codex} layer={layer} layerMode={mode}
            selection={selection} onPick={onPick} pickEnabled={pickEnabled} />}
        </Suspense>
      </div>
      {pickEnabled && (
        <div style={{ ...muted, fontSize: 12, padding: '8px 14px 0' }}>
          🖱️ <strong style={{ color: '#ffd24a' }}>Clic droit</strong> = coin A · <strong style={{ color: '#ffd24a' }}>clic gauche</strong> = coin B · glisser = pivoter
        </div>
      )}
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
      </div>
    </div>
  );
}
