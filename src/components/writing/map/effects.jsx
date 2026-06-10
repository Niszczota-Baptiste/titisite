import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from './presets';

// Floating fireflies / embers. One Points cloud, drifted as a whole — cheap
// enough for mobile (the count is already quality-adjusted by the caller).
export function Fireflies({ count, color, radius = 24 }) {
  const group = useRef();
  const positions = useMemo(() => {
    const rng = mulberry32(count * 31 + 5);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * radius;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = 0.6 + rng() * 9;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, [count, radius]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.rotation.y = t * 0.022;
    group.current.position.y = Math.sin(t * 0.45) * 0.5;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={color} size={0.22} sizeAttenuation transparent opacity={0.85}
          blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </points>
    </group>
  );
}

// Luminous arcs between connected zones. Dashed lines whose offset is animated
// so the energy appears to flow from one zone to the other.
export function ConnectionArcs({ zones, accent }) {
  const refs = useRef([]);

  const arcs = useMemo(() => {
    const byId = new Map(zones.map((z) => [z.id, z]));
    const seen = new Set();
    const out = [];
    for (const z of zones) {
      for (const otherId of z.connections || []) {
        const key = z.id < otherId ? `${z.id}-${otherId}` : `${otherId}-${z.id}`;
        const other = byId.get(otherId);
        if (!other || seen.has(key)) continue;
        seen.add(key);
        const a = new THREE.Vector3(z.x, 0.5, z.z);
        const b = new THREE.Vector3(other.x, 0.5, other.z);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.y = 1.6 + a.distanceTo(b) * 0.22;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        out.push({ key, points: curve.getPoints(28) });
      }
    }
    return out;
  }, [zones]);

  useFrame((_, delta) => {
    for (const line of refs.current) {
      if (line?.material) line.material.dashOffset -= delta * 1.6;
    }
  });

  return (
    <group>
      {arcs.map((arc, i) => (
        <Line
          key={arc.key}
          ref={(el) => { refs.current[i] = el; }}
          points={arc.points}
          color={accent}
          lineWidth={1.4}
          dashed
          dashSize={0.55}
          gapSize={0.35}
          transparent
          opacity={0.55}
        />
      ))}
    </group>
  );
}
