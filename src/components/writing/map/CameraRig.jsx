import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const HOME_POS = new THREE.Vector3(26, 21, 26);
const INTRO_POS = new THREE.Vector3(64, 52, -38);
const INTRO_SECONDS = 2.6;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Drives the two camera motions that OrbitControls can't do on its own:
// the opening fly-in, then the smooth re-targeting when a zone is selected.
// User input always wins — once the intro is over we only damp the *target*.
export function CameraRig({ controlsRef, focus, intro, onIntroEnd }) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const introDone = useRef(!intro);
  const target = useRef(new THREE.Vector3(0, 0, 0));

  // Initial placement only — intro/camera are stable for the component's life.
  useEffect(() => {
    if (introDone.current) camera.position.copy(HOME_POS);
    else {
      camera.position.copy(INTRO_POS);
      camera.lookAt(0, 0, 0);
    }
  }, [camera]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!introDone.current) {
      elapsed.current += delta;
      const t = Math.min(1, elapsed.current / INTRO_SECONDS);
      camera.position.lerpVectors(INTRO_POS, HOME_POS, easeOutCubic(t));
      camera.lookAt(0, 0, 0);
      if (t >= 1) {
        introDone.current = true;
        onIntroEnd?.();
      }
      return;
    }
    if (!controls) return;
    const dest = focus
      ? new THREE.Vector3(focus.x, (focus.y || 0) + 1.4, focus.z)
      : new THREE.Vector3(0, 1.5, 0);
    target.current.set(
      THREE.MathUtils.damp(controls.target.x, dest.x, 3.2, delta),
      THREE.MathUtils.damp(controls.target.y, dest.y, 3.2, delta),
      THREE.MathUtils.damp(controls.target.z, dest.z, 3.2, delta),
    );
    controls.target.copy(target.current);
    controls.update();
  });

  return null;
}
