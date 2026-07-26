import { lazy, Suspense } from 'react';
import { GOLD, MUTED, body, panel, title } from './theme';

// three.js reste dans son chunk : la vue Volume ne le charge qu'à l'ouverture
// de l'onglet.
const VolumeScene = lazy(() => import('./VolumeScene'));

export function VolumeView({ doc, dims, onOpenZone }) {
  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: '1px solid rgba(80,50,130,0.25)',
      }}>
        <h3 style={{ ...title, fontSize: 13, flex: 1 }}>Volume</h3>
        <span style={{ ...body, fontSize: 11, color: MUTED }}>
          clic sur une zone → plan 2D de son étage · molette pour zoomer
        </span>
      </div>
      <div style={{ height: '68vh', minHeight: 420, background: '#08051a' }}>
        <Suspense fallback={<Loading />}>
          <VolumeScene doc={doc} dims={dims} onPickZone={onOpenZone} />
        </Suspense>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...body, fontSize: 12, color: GOLD,
    }}>Chargement du rendu 3D…</div>
  );
}
