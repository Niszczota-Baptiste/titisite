import { useCallback, useEffect, useState } from 'react';

// État de sélection partagé entre la vue 3D (picking) et le WorldEditPanel.
//  - clic droit → coin A (min) ; clic gauche → coin B (max) ; le dernier coin
//    posé devient « actif ».
//  - flèches : déplacent le coin actif d'un bloc (X/Z) ; PageUp/PageDown : Y.
//  - shift + clic glissé vertical dans la vue 3D ajuste le Y (cf. BlueprintScene).
// `bbox` (emprise du build) borne tous les déplacements.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function useBlueprintSelection(bbox) {
  const [selection, setSelection] = useState(null);
  const [active, setActive] = useState('B'); // coin déplacé par les flèches

  // Initialise sur l'emprise complète dès qu'elle est connue.
  useEffect(() => {
    if (bbox) setSelection((cur) => cur || { min: { ...bbox.min }, max: { ...bbox.max } });
  }, [bbox]);

  const onPick = useCallback((corner, coord) => {
    setActive(corner);
    setSelection((cur) => {
      const base = cur || { min: coord, max: coord };
      return corner === 'A' ? { ...base, min: coord } : { ...base, max: coord };
    });
  }, []);

  // Déplacement fin au clavier (coin actif).
  useEffect(() => {
    if (!bbox) return undefined;
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return; // ne pas voler la saisie
      const MAP = {
        ArrowLeft: ['x', -1], ArrowRight: ['x', 1],
        ArrowUp: ['z', -1], ArrowDown: ['z', 1],
        PageUp: ['y', 1], PageDown: ['y', -1],
      };
      const m = MAP[e.key];
      if (!m) return;
      e.preventDefault();
      const [axis, d] = m;
      setSelection((cur) => {
        if (!cur) return cur;
        const k = active === 'A' ? 'min' : 'max';
        return { ...cur, [k]: { ...cur[k], [axis]: clamp(cur[k][axis] + d, bbox.min[axis], bbox.max[axis]) } };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bbox, active]);

  return { selection, setSelection, onPick, active, setActive };
}
