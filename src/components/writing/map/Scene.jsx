import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { BIOMES, MAP_RADIUS } from './presets';
import { Terrain } from './Terrain';
import { ZoneMarker } from './ZoneMarker';
import { CameraRig, HOME_POS } from './CameraRig';
import { ConnectionArcs, Fireflies } from './effects';

// The whole three.js side of the map lives behind this default export so that
// React.lazy keeps three/fiber/drei out of the main bundle.
//
// Public mode: rotate/zoom + hover/click on zones.
// Editable mode (admin): zones are draggable on the ground plane; the parent
// owns the positions and receives onZoneMove / onZoneMoveEnd.

const clampToIsland = (x, z) => {
  const r = Math.hypot(x, z);
  if (r <= MAP_RADIUS) return [x, z];
  return [(x / r) * MAP_RADIUS, (z / r) * MAP_RADIUS];
};

function SceneContent({
  zones, biomeKey, accent, seed, quality,
  hoveredId, selectedId, dimmedIds,
  onHover, onSelect, editable, onZoneMove, onZoneMoveEnd, intro,
}) {
  const controls = useRef();
  const [dragId, setDragId] = useState(null);
  const [introRunning, setIntroRunning] = useState(intro);
  const biome = BIOMES[biomeKey] || BIOMES.plaines;

  useEffect(() => {
    if (!dragId) return undefined;
    const end = () => {
      setDragId(null);
      if (controls.current) controls.current.enabled = true;
      onZoneMoveEnd?.(dragId);
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, [dragId, onZoneMoveEnd]);

  const startDrag = (id) => {
    setDragId(id);
    if (controls.current) controls.current.enabled = false;
  };

  const focusZone = selectedId != null ? zones.find((z) => z.id === selectedId) : null;

  return (
    <>
      <color attach="background" args={[biome.fog]} />
      <fog attach="fog" args={[biome.fog, 55, 150]} />
      <hemisphereLight args={['#b8c4e8', biome.fog, 0.5]} />
      <directionalLight position={[18, 28, 10]} intensity={1.15} color={biome.sun} />
      <pointLight position={[0, 16, 0]} intensity={0.5} distance={70} color={accent} />

      <Stars radius={120} depth={40} count={quality === 'low' ? 700 : 1800} factor={3.2} fade speed={0.6} />
      <Terrain biome={biome} zones={zones} seed={seed} quality={quality} />
      <Fireflies count={quality === 'low' ? 50 : 140} color={biome.lava ? '#ff9a5a' : accent} />
      <ConnectionArcs zones={zones.filter((z) => !dimmedIds.has(z.id))} accent={accent} />

      {zones.map((zone) => (
        <ZoneMarker
          key={zone.id}
          zone={zone}
          accent={accent}
          hovered={hoveredId === zone.id}
          selected={selectedId === zone.id}
          dimmed={dimmedIds.has(zone.id)}
          onHover={onHover}
          onSelect={onSelect}
          editable={editable}
          onDragStart={startDrag}
        />
      ))}

      {/* Invisible drag plane (admin) — converts pointer moves into island coords */}
      {editable && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          visible={false}
          onPointerMove={(e) => {
            if (dragId == null) return;
            const [x, z] = clampToIsland(e.point.x, e.point.z);
            onZoneMove?.(dragId, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
          }}
        >
          <planeGeometry args={[220, 220]} />
        </mesh>
      )}

      <CameraRig controlsRef={controls} focus={focusZone} intro={intro} onIntroEnd={() => setIntroRunning(false)} />
      <OrbitControls
        ref={controls}
        enabled={!introRunning}
        enablePan={Boolean(editable)}
        enableDamping
        dampingFactor={0.08}
        minDistance={12}
        maxDistance={70}
        minPolarAngle={0.25}
        maxPolarAngle={1.32}
      />
    </>
  );
}

export default function MapScene(props) {
  return (
    <Canvas
      dpr={props.quality === 'low' ? [1, 1.5] : [1, 2]}
      camera={{ position: HOME_POS.toArray(), fov: 38 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
      onPointerMissed={() => props.onSelect?.(null)}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  );
}
