import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_RADIUS, mulberry32 } from './presets';

// The island: a displaced plateau, the surrounding water plane and a
// deterministic scatter of biome decorations that avoids the zones.

function Decor({ kind, color }) {
  if (kind === 'sapin') {
    return (
      <group>
        <mesh position={[0, 0.5, 0]}>
          <coneGeometry args={[0.42, 1, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <coneGeometry args={[0.3, 0.7, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      </group>
    );
  }
  if (kind === 'cactus') {
    return (
      <group>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.14, 0.16, 1, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
        <mesh position={[0.22, 0.62, 0]} rotation={[0, 0, -0.7]}>
          <cylinderGeometry args={[0.09, 0.09, 0.42, 6]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      </group>
    );
  }
  if (kind === 'rocher') {
    return (
      <mesh position={[0, 0.22, 0]} rotation={[0.3, 0.8, 0.1]}>
        <dodecahedronGeometry args={[0.36, 0]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    );
  }
  // 'arbre' (default): trunk + canopy
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 0.6, 5]} />
        <meshStandardMaterial color="#5d4032" flatShading />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.45, 7, 5]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

export function Terrain({ biome, zones, seed, quality }) {
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(MAP_RADIUS + 6, MAP_RADIUS + 9, 3.4, 64, 1);
    const pos = geo.attributes.position;
    // Organic feel: gentle height noise on the plateau, radial jitter on the rim.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (y > 0 && r > 4) {
        pos.setY(i, y + Math.sin(x * 0.55) * Math.cos(z * 0.5) * 0.32 * Math.min(1, (r - 4) / 8));
      }
      if (r > MAP_RADIUS + 3) {
        const j = 1 + (Math.sin(x * 1.7 + z * 2.3) * 0.035);
        pos.setX(i, x * j); pos.setZ(i, z * j);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const decors = useMemo(() => {
    const rng = mulberry32(seed || 7);
    const n = quality === 'low' ? 22 : 42;
    const out = [];
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = 5 + rng() * (MAP_RADIUS - 2);
      const x = Math.cos(a) * r; const z = Math.sin(a) * r;
      if (zones.some((zz) => Math.hypot(zz.x - x, zz.z - z) < 3.2)) continue;
      out.push({ x, z, s: 0.7 + rng() * 0.9, rot: rng() * Math.PI * 2 });
    }
    return out;
  }, [seed, zones, quality]);

  return (
    <group>
      <mesh geometry={geometry} position={[0, -1.72, 0]} receiveShadow>
        <meshStandardMaterial color={biome.ground} flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.9, 0]}>
        <circleGeometry args={[110, 48]} />
        <meshStandardMaterial
          color={biome.water}
          emissive={biome.lava ? biome.water : '#000000'}
          emissiveIntensity={biome.lava ? 0.55 : 0}
          metalness={0.25}
          roughness={0.6}
        />
      </mesh>
      {decors.map((d, i) => (
        <group key={i} position={[d.x, 0, d.z]} scale={d.s} rotation={[0, d.rot, 0]}>
          <Decor kind={biome.decor} color={biome.decorColor} />
        </group>
      ))}
    </group>
  );
}
