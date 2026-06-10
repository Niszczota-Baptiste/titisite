// Low-poly building meshes built from three primitives only (no models to
// load). Every type accepts the universe accent for its emissive parts —
// windows, braziers, runes — so each world keeps its identity color.

const STONE = '#8a7f9e';
const STONE_DARK = '#5d5472';
const WOOD = '#6b4a36';

function Glow({ position, size = [0.16, 0.2, 0.05], accent, lit }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 2.4 : 1.2} toneMapped={false} />
    </mesh>
  );
}

function Tour({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.55, 0.68, 2.6, 8]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0, 3.05, 0]}>
        <coneGeometry args={[0.82, 1.1, 8]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      <Glow position={[0, 1.7, 0.56]} accent={accent} lit={lit} />
      <Glow position={[0, 1.0, 0.6]} accent={accent} lit={lit} />
    </group>
  );
}

function Maison({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.5, 1.1, 1.25]} />
        <meshStandardMaterial color="#9c8fae" flatShading />
      </mesh>
      <mesh position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.2, 0.95, 4]} />
        <meshStandardMaterial color="#7a3f4e" flatShading />
      </mesh>
      <Glow position={[0, 0.5, 0.65]} size={[0.32, 0.5, 0.05]} accent={accent} lit={lit} />
      <Glow position={[0.45, 0.7, 0.64]} accent={accent} lit={lit} />
    </group>
  );
}

function Donjon({ accent, lit }) {
  const corners = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
  return (
    <group>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.7, 1.8, 1.7]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.15, 0]}>
            <cylinderGeometry args={[0.32, 0.38, 2.3, 6]} />
            <meshStandardMaterial color={STONE_DARK} flatShading />
          </mesh>
          <mesh position={[0, 2.55, 0]}>
            <coneGeometry args={[0.44, 0.7, 6]} />
            <meshStandardMaterial color="#473f5c" flatShading />
          </mesh>
        </group>
      ))}
      <Glow position={[0, 1.2, 0.88]} size={[0.22, 0.55, 0.05]} accent={accent} lit={lit} />
    </group>
  );
}

function Temple({ accent, lit }) {
  const cols = [[-0.85, -0.6], [0.85, -0.6], [-0.85, 0.6], [0.85, 0.6]];
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[2.3, 0.32, 1.8]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      {cols.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.95, z]}>
          <cylinderGeometry args={[0.15, 0.18, 1.3, 6]} />
          <meshStandardMaterial color={STONE} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[2.45, 0.28, 1.95]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0, 2.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.55, 2.3, 3]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.26, 8, 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 2.6 : 1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Cristal({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 1.35, 0]}>
        <octahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial
          color={accent} emissive={accent} emissiveIntensity={lit ? 1.8 : 0.9}
          transparent opacity={0.92} flatShading toneMapped={false}
        />
      </mesh>
      <mesh position={[0.55, 0.32, 0.2]} rotation={[0.3, 0.5, 0.2]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 1.4 : 0.7} flatShading toneMapped={false} />
      </mesh>
      <mesh position={[-0.5, 0.22, -0.25]}>
        <dodecahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
    </group>
  );
}

function Arbre({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.32, 0.5, 1.7, 7]} />
        <meshStandardMaterial color={WOOD} flatShading />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <sphereGeometry args={[1.25, 9, 7]} />
        <meshStandardMaterial color="#3f7d55" flatShading />
      </mesh>
      <mesh position={[0.8, 1.7, 0.4]}>
        <sphereGeometry args={[0.6, 8, 6]} />
        <meshStandardMaterial color="#356b48" flatShading />
      </mesh>
      <Glow position={[0.5, 2.5, 0.9]} size={[0.14, 0.14, 0.14]} accent={accent} lit={lit} />
      <Glow position={[-0.7, 2.2, 0.7]} size={[0.12, 0.12, 0.12]} accent={accent} lit={lit} />
      <Glow position={[0.2, 2.9, -0.6]} size={[0.12, 0.12, 0.12]} accent={accent} lit={lit} />
    </group>
  );
}

function Ruine({ accent, lit }) {
  return (
    <group>
      <mesh position={[-0.6, 0.55, -0.3]} rotation={[0.08, 0, 0.06]}>
        <cylinderGeometry args={[0.18, 0.22, 1.1, 6]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0.55, 0.85, -0.4]} rotation={[-0.05, 0, -0.1]}>
        <cylinderGeometry args={[0.18, 0.22, 1.7, 6]} />
        <meshStandardMaterial color={STONE} flatShading />
      </mesh>
      <mesh position={[0.1, 0.18, 0.6]} rotation={[0, 0.6, Math.PI / 2.15]}>
        <cylinderGeometry args={[0.18, 0.18, 1.3, 6]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      <mesh position={[-0.2, 0.3, 0.1]} rotation={[0, 0.4, 0.12]}>
        <boxGeometry args={[1.1, 0.6, 0.5]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      <mesh position={[0, 0.35, -0.1]}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 2.2 : 1.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Phare({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.42, 0.62, 3, 9]} />
        <meshStandardMaterial color="#d8d2e6" flatShading />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.47, 0.47, 0.4, 9]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
      <mesh position={[0, 3.15, 0]}>
        <sphereGeometry args={[0.34, 9, 7]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 3 : 1.8} toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.55, 0]}>
        <coneGeometry args={[0.4, 0.5, 9]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
    </group>
  );
}

function Tente({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 0.8, 0]}>
        <coneGeometry args={[1.15, 1.7, 7]} />
        <meshStandardMaterial color="#a05f48" flatShading />
      </mesh>
      <mesh position={[0.85, 0.25, 0.5]}>
        <coneGeometry args={[0.55, 0.85, 6]} />
        <meshStandardMaterial color="#8a4f3c" flatShading />
      </mesh>
      <mesh position={[-0.75, 0.22, 0.45]}>
        <sphereGeometry args={[0.18, 8, 6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={lit ? 2.6 : 1.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Monolithe({ accent, lit }) {
  return (
    <group>
      <mesh position={[0, 1.45, 0]} rotation={[0.04, 0.3, -0.05]}>
        <boxGeometry args={[0.75, 2.9, 0.5]} />
        <meshStandardMaterial color="#3c3550" flatShading />
      </mesh>
      <Glow position={[0.12, 1.9, 0.28]} size={[0.12, 0.34, 0.05]} accent={accent} lit={lit} />
      <Glow position={[-0.14, 1.2, 0.29]} size={[0.12, 0.22, 0.05]} accent={accent} lit={lit} />
      <Glow position={[0.05, 0.62, 0.3]} size={[0.18, 0.12, 0.05]} accent={accent} lit={lit} />
      <mesh position={[0.6, 0.16, 0.4]} rotation={[0.2, 0.7, 0]}>
        <dodecahedronGeometry args={[0.26, 0]} />
        <meshStandardMaterial color={STONE_DARK} flatShading />
      </mesh>
    </group>
  );
}

const TYPES = {
  tour: Tour, maison: Maison, donjon: Donjon, temple: Temple, cristal: Cristal,
  arbre: Arbre, ruine: Ruine, phare: Phare, tente: Tente, monolithe: Monolithe,
};

// Approximate roof height per type — anchors the floating label/preview.
export const BUILDING_HEIGHT = {
  tour: 3.8, maison: 2.3, donjon: 3.1, temple: 2.6, cristal: 2.6,
  arbre: 3.7, ruine: 2.1, phare: 4, tente: 2, monolithe: 3.2,
};

export function Building({ type, accent, lit }) {
  const Comp = TYPES[type] || Tour;
  return <Comp accent={accent} lit={lit} />;
}
