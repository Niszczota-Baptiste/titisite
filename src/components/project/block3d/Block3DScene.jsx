import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildBlockGroup } from './buildBlock';

// Rendu three.js d'un seul bloc, en lumière douce + caméra orthographique façon
// inventaire Minecraft (légère plongée, rotation lente). Plain three (pas de
// fiber) : une instance = un contexte WebGL léger, monté seulement au survol par
// le parent, donc on ne sature jamais le quota de contextes du navigateur.
//
// Export par défaut → consommé via React.lazy depuis Block3D (garde three hors
// du bundle principal).
export default function Block3DScene({ model, size = 64, spin = true, tint = null }) {
  const mountRef = useRef(null);
  const spinRef = useRef(spin);
  spinRef.current = spin;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !model) return undefined;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const h = 0.92;
    const camera = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(0.6, 1.2, 0.8);
    scene.add(dir);

    const { group, dispose } = buildBlockGroup(model, tint);
    group.rotation.x = 0.52; // ~30° de plongée
    group.rotation.y = 0.7;
    scene.add(group);

    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 64);
      last = now;
      if (spinRef.current) group.rotation.y += dt * 0.0009;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [model, size, tint]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
