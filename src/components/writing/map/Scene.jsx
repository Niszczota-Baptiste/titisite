import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { AMBIANCES, MAP_RADIUS } from './presets';
import { buildWorld } from './terrain';
import { VoxelTerrain } from './VoxelTerrain';
import { ZoneMarker } from './ZoneMarker';
import { CameraRig, HOME_POS } from './CameraRig';
import { Connections, Fireflies, GroundFog } from './effects';

// The whole three.js side of the map lives behind this default export so that
// React.lazy keeps three/fiber/drei out of the main bundle.
//
// Public mode: rotate/zoom + hover/click on zones, optional day/night.
// Editable mode (admin): zones are draggable on the terrain itself; the parent
// owns the positions and receives onZoneMove / onZoneMoveEnd.

const clampToIsland = (x, z) => {
  const r = Math.hypot(x, z);
  if (r <= MAP_RADIUS) return [x, z];
  return [(x / r) * MAP_RADIUS, (z / r) * MAP_RADIUS];
};

// Smoothly drives sky, fog and lights toward the active ambiance so the
// day/night toggle feels like a sunrise, not a switch.
function Atmosphere({ ambiance }) {
  const { scene } = useThree();
  const sun = useRef();
  const hemi = useRef();
  const target = useMemo(() => ({
    sky: new THREE.Color(ambiance.sky),
    sun: new THREE.Color(ambiance.sun),
  }), [ambiance]);

  useEffect(() => {
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(ambiance.sky);
    if (!scene.fog) scene.fog = new THREE.Fog(ambiance.sky, 55, 150);
  }, [scene, ambiance.sky]);

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-2.2 * delta);
    if (scene.background instanceof THREE.Color) scene.background.lerp(target.sky, k);
    if (scene.fog) scene.fog.color.lerp(target.sky, k);
    if (sun.current) {
      sun.current.color.lerp(target.sun, k);
      sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, ambiance.sunIntensity, 2.2, delta);
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, ambiance.hemi, 2.2, delta);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#b8c4e8', '#1a1426', 0.5]} />
      <directionalLight ref={sun} position={[18, 28, 10]} intensity={1} color={ambiance.sun} />
      {/* Camera-side fill so south/east block faces stay readable at night */}
      <directionalLight position={[24, 14, 30]} intensity={1.1} color="#9fa8d8" />
    </>
  );
}

function SceneContent({
  zones, biomeKey, terrain, accent, quality, dayMode,
  hoveredId, selectedId, dimmedIds,
  onHover, onSelect, editable, onZoneMove, onZoneMoveEnd, intro,
}) {
  const controls = useRef();
  const [dragId, setDragId] = useState(null);
  // Grab offset: the ray under the cursor lands on the terrain *behind* the
  // building, so we anchor the drag to the zone's position at grab time and
  // move by deltas — the building stays under the hand.
  const drag = useRef(null);
  const [introRunning, setIntroRunning] = useState(intro);
  const ambiance = AMBIANCES[dayMode ? 'jour' : 'nuit'];

  // One world build shared by terrain, markers, roads and the camera: heights,
  // biomes, carved paths and bridges all come from the same grids.
  const world = useMemo(() => buildWorld(terrain, biomeKey, zones), [terrain, biomeKey, zones]);

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
    const zone = zones.find((z) => z.id === id);
    drag.current = zone ? { id, x: zone.x, z: zone.z, ox: null, oz: null } : null;
    setDragId(id);
    if (controls.current) controls.current.enabled = false;
  };

  const focusZone = selectedId != null ? zones.find((z) => z.id === selectedId) : null;
  const activeId = selectedId ?? hoveredId;

  return (
    <>
      <Atmosphere ambiance={ambiance} />
      <pointLight position={[0, 16, 0]} intensity={dayMode ? 10 : 60} distance={70} color={accent} />

      {ambiance.stars && (
        <Stars radius={120} depth={40} count={quality === 'low' ? 700 : 1800} factor={3.2} fade speed={0.6} />
      )}
      <VoxelTerrain
        world={world}
        zones={zones}
        quality={quality}
        waterColor={world.terrain.waterColor || ambiance.water}
        groundProps={editable ? {
          onPointerMove: (e) => {
            const d = drag.current;
            if (dragId == null || !d || d.id !== dragId) return;
            e.stopPropagation();
            if (d.ox == null) { d.ox = e.point.x - d.x; d.oz = e.point.z - d.z; return; }
            const [x, z] = clampToIsland(e.point.x - d.ox, e.point.z - d.oz);
            onZoneMove?.(dragId, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
          },
        } : {}}
      />
      <GroundFog color={dayMode ? '#ffffff' : accent} level={world.waterLevel} quality={quality} />
      {!dayMode && <Fireflies count={quality === 'low' ? 50 : 140} color={accent} baseY={world.waterLevel + 1} />}
      <Connections world={world} accent={accent} activeId={activeId} />

      {zones.map((zone) => (
        <ZoneMarker
          key={zone.id}
          zone={zone}
          groundY={world.heightAt(zone.x, zone.z)}
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

      <CameraRig
        controlsRef={controls}
        focus={focusZone ? { x: focusZone.x, y: world.heightAt(focusZone.x, focusZone.z), z: focusZone.z } : null}
        intro={intro}
        onIntroEnd={() => setIntroRunning(false)}
      />
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
