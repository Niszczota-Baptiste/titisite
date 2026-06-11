import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from './presets';

// Floating fireflies / embers. One Points cloud, drifted as a whole — cheap
// enough for mobile (the count is already quality-adjusted by the caller).
export function Fireflies({ count, color, radius = 24, baseY = 2 }) {
  const group = useRef();
  const positions = useMemo(() => {
    const rng = mulberry32(count * 31 + 5);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * radius;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = baseY + rng() * 9;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, [count, radius, baseY]);

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

// Soft volumetric-ish ground haze: a few large additive sprites hugging the
// terrain, slowly drifting.
export function GroundFog({ color, level, quality, spread = 36 }) {
  const group = useRef();
  const puffs = useMemo(() => {
    const rng = mulberry32(17);
    const n = quality === 'low' ? 4 : 8;
    return Array.from({ length: n }, () => ({
      x: (rng() - 0.5) * spread, z: (rng() - 0.5) * spread,
      s: 7 + rng() * 9, speed: 0.05 + rng() * 0.1, phase: rng() * Math.PI * 2,
    }));
  }, [quality, spread]);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((m, i) => {
      const p = puffs[i];
      m.position.x = p.x + Math.sin(clock.elapsedTime * p.speed + p.phase) * 4;
      m.material.opacity = 0.05 + Math.sin(clock.elapsedTime * 0.3 + p.phase) * 0.025;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, level + 1.2, p.z]} scale={[p.s, p.s * 0.4, 1]}>
          <spriteMaterial map={tex} color={color} transparent opacity={0.07} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

// Visual relations between zones, computed by the terrain builder:
// 'route' connections are carved into the ground (with bridges over water) —
// here we add a light pulse traveling the road when one endpoint is active.
// 'arc' connections stay as animated luminous dashed arcs.
export function Connections({ world, accent, activeId }) {
  const arcRefs = useRef([]);
  const pulseRefs = useRef([]);

  const arcs = useMemo(() => world.routes
    .filter((r) => r.style === 'arc')
    .map((r) => {
      if (r.points.length > 2) {
        // Hand-drawn course: glide through the waypoints, hugging the relief.
        const pts = r.points.map(([x, z]) => new THREE.Vector3(x, world.heightAt(x, z) + 1.4, z));
        return { key: r.key, points: new THREE.CatmullRomCurve3(pts).getPoints(12 * pts.length) };
      }
      const [ax, az] = r.points[0];
      const [bx, bz] = r.points[r.points.length - 1];
      const a = new THREE.Vector3(ax, world.heightAt(ax, az) + 0.6, az);
      const b = new THREE.Vector3(bx, world.heightAt(bx, bz) + 0.6, bz);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 1.6 + a.distanceTo(b) * 0.22;
      return { key: r.key, points: new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(28) };
    }), [world]);

  const roads = useMemo(() => world.routes
    .filter((r) => r.style === 'route' && r.points.length > 1)
    .map((r) => ({
      ...r,
      pts: r.points.map(([x, z]) => new THREE.Vector3(x, world.heightAt(x, z) + 0.45, z)),
    })), [world]);

  useFrame(({ clock }, delta) => {
    for (const line of arcRefs.current) {
      if (line?.material) line.material.dashOffset -= delta * 1.6;
    }
    roads.forEach((r, i) => {
      const m = pulseRefs.current[i];
      if (!m) return;
      const active = activeId != null && (r.a === activeId || r.b === activeId);
      m.visible = active;
      if (!active) return;
      const t = (clock.elapsedTime * 0.35) % 1;
      const f = t * (r.pts.length - 1);
      const k = Math.floor(f);
      const p = r.pts[k].clone().lerp(r.pts[Math.min(k + 1, r.pts.length - 1)], f - k);
      m.position.copy(p);
    });
  });

  return (
    <group>
      {arcs.map((arc, i) => (
        <Line
          key={arc.key}
          ref={(el) => { arcRefs.current[i] = el; }}
          points={arc.points}
          color={accent}
          lineWidth={1.4}
          dashed dashSize={0.55} gapSize={0.35}
          transparent opacity={0.55}
        />
      ))}
      {roads.map((r, i) => (
        <mesh key={r.key} ref={(el) => { pulseRefs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[0.2, 8, 6]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
