import { useMemo } from 'react';
import { BLUEPRINTS, BUILDING_HEIGHT } from './blueprints';
import { buildBoxes } from './voxel';

export { BUILDING_HEIGHT };

// Renders a blueprint as two merged meshes: one vertex-colored solid, one
// emissive 'accent' part (windows, lanterns, runes) that brightens on hover.
export function Building({ type, accent, lit }) {
  const { solid, glow } = useMemo(
    () => buildBoxes(BLUEPRINTS[type] || BLUEPRINTS.tour, accent),
    [type, accent],
  );
  return (
    <group>
      <mesh geometry={solid}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      {glow && (
        <mesh geometry={glow}>
          <meshStandardMaterial
            color={accent} emissive={accent}
            emissiveIntensity={lit ? 2.4 : 1.1} toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
