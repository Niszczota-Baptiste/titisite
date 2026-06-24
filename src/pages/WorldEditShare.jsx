import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { loadBlockCodex } from '../data/blockCodex';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageMeta } from '../hooks/usePageMeta';
import { ToastProvider } from '../ui/ToastProvider';
import { ConfirmProvider } from '../ui/ConfirmProvider';
import { BlueprintCanvas } from '../components/project/builds/BlueprintCanvas';
import { WorldEditPanel } from '../components/project/builds/WorldEditPanel';
import { useBlueprintSelection } from '../components/project/builds/useBlueprintSelection';

// Page d'accès à un build par lien de partage scopé (sans cookie).
//  - scope `view`  → vue 3D + aperçu, aucune écriture
//  - scope `edit`  → éditeur WorldEdit complet (transform/undo/export)
export default function WorldEditShare() {
  const { token } = useParams();
  const isMobile = useIsMobile(720);
  const we = useMemo(() => api.worldeditShared(token), [token]);
  const [state, setState] = useState(undefined); // undefined=chargement, null=invalide
  const [data, setData] = useState(null);
  const [codex, setCodex] = useState(null);
  const { selection, setSelection, onPick, active, setActive } = useBlueprintSelection(
    state && state.bbox ? state.bbox : null,
  );

  usePageMeta(state?.name ? `${state.name} — WorldEdit` : 'Build partagé');

  const reload = useCallback(() => fetch(we.dataUrl(), { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
    .then(setData)
    .catch(() => {}), [we]);

  const refreshState = useCallback(() => we.state().then(setState).catch(() => setState(null)), [we]);

  useEffect(() => {
    refreshState();
    reload();
    let alive = true;
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [we, reload, refreshState]);

  const pickEnabled = !!(state?.canEdit && state?.editable);

  return (
    <div style={{ minHeight: '100vh', background: '#050511', color: '#ede8f8', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '24px 14px' : '40px 24px' }}>
        {state === null ? (
          <p style={{ color: 'rgba(180,170,200,0.7)' }}>Ce lien n’existe pas, a expiré ou a été révoqué.</p>
        ) : state === undefined ? (
          <p style={{ color: 'rgba(180,170,200,0.7)' }}>Chargement…</p>
        ) : (
          <ToastProvider>
            <ConfirmProvider>
              <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: isMobile ? 24 : 32, margin: '0 0 6px' }}>
                🏗️ {state.name}
              </h1>
              <p style={{ color: 'rgba(180,170,200,0.7)', fontSize: 14, marginTop: 0 }}>
                {state.bbox.max.x - state.bbox.min.x + 1}×{state.bbox.max.y - state.bbox.min.y + 1}×{state.bbox.max.z - state.bbox.min.z + 1}
                {' · '}accès {state.canEdit ? 'éditeur' : 'lecteur'}
              </p>
              <div style={{ background: 'rgba(20,10,42,0.5)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 14, overflow: 'hidden' }}>
                {data
                  ? <BlueprintCanvas key={`${data.size.x}x${data.size.y}x${data.size.z}-${data.count}`}
                      data={data} codex={codex} height={isMobile ? 340 : 520}
                      selection={selection} onPick={onPick} pickEnabled={pickEnabled} />
                  : <div style={{ padding: 20, color: 'rgba(180,170,200,0.7)' }}>Chargement du build…</div>}
                {state.canEdit && <WorldEditPanel we={we} state={state} selection={selection}
                  setSelection={setSelection} active={active} setActive={setActive}
                  onChanged={reload} refreshState={refreshState} />}
              </div>
            </ConfirmProvider>
          </ToastProvider>
        )}
      </div>
    </div>
  );
}
