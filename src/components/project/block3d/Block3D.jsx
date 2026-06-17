import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { loadModel } from '../../../data/minecraftModels';

// three.js + le builder de géométrie vivent dans ce chunk uniquement, chargé à
// la première utilisation réelle (survol d'un item en mode 3D).
const Scene = lazy(() => import('./Block3DScene'));

// Affiche un bloc en 3D si — et seulement si — l'id du codex possède un modèle à
// géométrie (render "model"). Sinon rend `null` : l'appelant garde son icône
// plate visible dessous (les render "cube"/"flat" n'ont rien de plus à montrer).
export function Block3D({ id, size = 64, spin = true, background = 'rgba(20,10,42,0.92)' }) {
  const [model, setModel] = useState(undefined); // undefined=chargement, null=aucun
  const ref = useRef(true);

  useEffect(() => {
    ref.current = true;
    setModel(undefined);
    loadModel(id).then((m) => {
      if (ref.current) setModel(m && m.render === 'model' ? m : null);
    });
    return () => { ref.current = false; };
  }, [id]);

  if (!model) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: 'inherit',
      overflow: 'hidden', background,
    }}>
      <Suspense fallback={null}>
        <Scene model={model} size={size} spin={spin} />
      </Suspense>
    </div>
  );
}
