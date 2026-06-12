import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from './presets';
import { buildDecorGeometry, buildTerrainGeometry } from './voxel';

// Procedurally generated noise texture for the water sparkle layer — no asset
// to load, additive-blended and scrolled over the water plane so seas and
// rivers shimmer at near-zero cost.
function makeSparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(99);
  for (let i = 0; i < 240; i++) {
    const a = 0.25 + rng() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.fillRect(Math.floor(rng() * 128), Math.floor(rng() * 128), rng() > 0.7 ? 2 : 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

// `groundProps` lets the admin editor attach pointer handlers straight to the
// terrain and water meshes — dragging then follows the real relief instead of
// a flat proxy plane.
export function VoxelTerrain({ world, zones, quality, waterColor, groundProps = {} }) {
  const sparkle = useRef();

  const terrainGeo = useMemo(() => buildTerrainGeometry(world), [world]);
  const decorGeo = useMemo(
    () => buildDecorGeometry(world, zones, mulberry32(world.terrain.seed + 31), quality),
    [world, zones, quality],
  );
  const sparkleTex = useMemo(makeSparkleTexture, []);

  // GPU cleanup: three.js never garbage-collects GPU buffers on its own.
  // Each regenerated geometry/texture must be disposed when replaced or when
  // the map unmounts, otherwise every terrain edit leaks VRAM.
  useEffect(() => () => terrainGeo.dispose(), [terrainGeo]);
  useEffect(() => () => decorGeo.dispose(), [decorGeo]);
  useEffect(() => () => sparkleTex.dispose(), [sparkleTex]);

  useFrame(({ clock }) => {
    // River/sea flow: scroll the sparkle, breathe the water level a touch.
    sparkleTex.offset.set(clock.elapsedTime * 0.012, clock.elapsedTime * 0.008);
    if (sparkle.current) {
      sparkle.current.material.opacity = 0.16 + Math.sin(clock.elapsedTime * 0.8) * 0.06;
    }
  });

  const waterY = world.waterLevel - 0.22;

  return (
    <group>
      <mesh geometry={terrainGeo} {...groundProps}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <mesh geometry={decorGeo}>
        <meshStandardMaterial vertexColors flatShading />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY, 0]} {...groundProps}>
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial
          color={waterColor} transparent opacity={0.88}
          roughness={0.35} metalness={0.1}
        />
      </mesh>
      <mesh ref={sparkle} rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY + 0.06, 0]}>
        <planeGeometry args={[260, 260]} />
        <meshBasicMaterial
          map={sparkleTex} transparent opacity={0.2}
          blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>
    </group>
  );
}
