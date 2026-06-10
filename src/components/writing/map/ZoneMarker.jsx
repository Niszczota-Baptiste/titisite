import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Building, BUILDING_HEIGHT } from './buildings';
import { hexToRgb } from '../tokens';

// One clickable zone: its voxel building on a stone platform, a hover halo,
// a click pulse and the floating label / quick-preview card (drei Html → real
// DOM, so the preview inherits the site's typography).

export function ZoneMarker({
  zone, groundY, accent, hovered, selected, dimmed,
  onHover, onSelect, editable, onDragStart,
}) {
  const group = useRef();
  const halo = useRef();
  const [pulse, setPulse] = useState(0); // ms timestamp of the last click

  const rgb = hexToRgb(accent) || '201,168,232';
  const lit = hovered || selected;
  const height = (BUILDING_HEIGHT[zone.building] || 3) * zone.scale;

  useFrame((state, delta) => {
    if (!group.current) return;
    const targetScale = (dimmed ? 0.55 : 1) * zone.scale * (lit ? 1.07 : 1);
    const s = THREE.MathUtils.damp(group.current.scale.x, targetScale, 8, delta);
    group.current.scale.setScalar(s);
    if (halo.current) {
      const m = halo.current.material;
      m.opacity = THREE.MathUtils.damp(m.opacity, lit && !dimmed ? 0.85 : 0, 10, delta);
      halo.current.rotation.z += delta * (lit ? 1.2 : 0.25);
    }
  });

  const pulseAge = pulse ? Math.min(1, (Date.now() - pulse) / 650) : 1;

  return (
    <group position={[zone.x, groundY, zone.z]}>
      <group
        ref={group}
        rotation={[0, zone.rotation, 0]}
        onPointerOver={(e) => { if (dimmed) return; e.stopPropagation(); onHover(zone.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ''; }}
        onPointerDown={(e) => {
          if (!editable) return;
          e.stopPropagation();
          onDragStart?.(zone.id);
        }}
        onClick={(e) => {
          if (dimmed) return;
          e.stopPropagation();
          setPulse(Date.now());
          onSelect(zone.id);
        }}
      >
        {/* Voxel stone platform under the building */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[3.6, 0.26, 3]} />
          <meshStandardMaterial color={selected ? accent : '#6f6a78'} flatShading transparent opacity={selected ? 0.6 : 1} />
        </mesh>
        <group position={[0, 0.25, 0]}>
          <Building type={zone.building} accent={accent} lit={lit} />
        </group>
      </group>

      {/* Hover halo + click pulse, on the ground, unaffected by building scale */}
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <ringGeometry args={[2.3, 2.55, 36]} />
        <meshBasicMaterial color={accent} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {pulseAge < 1 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.36, 0]} scale={1 + pulseAge * 2.6}>
          <ringGeometry args={[2.1, 2.3, 36]} />
          <meshBasicMaterial color={accent} transparent opacity={(1 - pulseAge) * 0.8} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {!dimmed && (
        <Html position={[0, height + 1.2, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          {hovered && !selected ? (
            <div style={{
              width: 230, background: 'rgba(11,6,32,0.94)', border: `1px solid rgba(${rgb},0.45)`,
              borderRadius: 12, padding: '12px 14px', boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
              transform: 'translateY(-6px)', textAlign: 'left',
            }}>
              {zone.category && (
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: `rgba(${rgb},0.85)`, margin: '0 0 5px' }}>{zone.category}</p>
              )}
              <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 700, color: '#ede8f8', margin: 0 }}>{zone.title}</p>
              {zone.description && (
                <p style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 11.5, lineHeight: 1.5, color: 'rgba(200,192,216,0.85)',
                  margin: '6px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{zone.description}</p>
              )}
              {zone.stats && (
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: 'rgba(180,170,200,0.7)', margin: '7px 0 0' }}>
                  {zone.stats.chapters > 0 && `${zone.stats.chapters} chapitre${zone.stats.chapters > 1 ? 's' : ''} · `}
                  {zone.stats.readingMin > 0 && `${zone.stats.readingMin} min de lecture`}
                </p>
              )}
            </div>
          ) : (
            <div style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: '0.5px',
              color: lit ? accent : 'rgba(232,228,248,0.82)', whiteSpace: 'nowrap',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)', padding: '2px 8px',
              background: 'rgba(8,5,20,0.55)', borderRadius: 8,
              border: `1px solid rgba(${rgb},${lit ? 0.5 : 0.16})`,
            }}>{zone.title}</div>
          )}
        </Html>
      )}
    </group>
  );
}
