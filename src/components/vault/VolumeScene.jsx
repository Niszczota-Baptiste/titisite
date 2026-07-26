import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Vue Volume — export par défaut pour que `React.lazy` garde three.js hors du
// bundle initial (même patron que BlueprintScene des builds 3D).
//
// On ne rend JAMAIS des millions de blocs : le gabarit en filaire, un plancher
// par étage, une boîte extrudée semi-transparente par zone, et les coffres
// agrégés dans un seul InstancedMesh.

const CHEST_LIMIT = 40000;

export default function VolumeScene({ doc, dims, onPickZone }) {
  const mountRef = useRef(null);
  const pickRef = useRef(onPickZone);
  pickRef.current = onPickZone;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#08051a');

    // Cadrage sur la hauteur RÉELLEMENT occupée : un gabarit de 200 de haut
    // pour cinq étages de 6 blocs mettrait sinon la salle en timbre-poste.
    const used = doc.floors.length > 0
      ? Math.max(...doc.floors.map((f) => f.yMax)) + 1
      : Math.min(dims.y, 24);
    const spanXZ = Math.max(dims.x, dims.z);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.5, (spanXZ + dims.y) * 12 + 200);
    camera.position.set(spanXZ * 0.85, Math.max(used * 1.6, spanXZ * 0.5), spanXZ * 1.05);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, used / 2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1, 2, 1);
    scene.add(key);

    // Repère : tout est centré sur le gabarit pour que l'orbite tourne autour
    // du bâtiment et pas de son coin.
    const ox = -dims.x / 2;
    const oz = -dims.z / 2;

    // Gabarit filaire.
    const shell = new THREE.Box3(
      new THREE.Vector3(ox, 0, oz),
      new THREE.Vector3(ox + dims.x, dims.y, oz + dims.z),
    );
    const shellHelper = new THREE.Box3Helper(shell, new THREE.Color('#e8c86a'));
    shellHelper.material.transparent = true;
    shellHelper.material.opacity = 0.55;
    scene.add(shellHelper);

    const grid = new THREE.GridHelper(Math.max(dims.x, dims.z), Math.max(4, Math.round(Math.max(dims.x, dims.z) / 16)), 0x5a4a8a, 0x2a2050);
    grid.position.y = 0;
    scene.add(grid);

    // Planchers.
    for (const floor of doc.floors) {
      const geo = new THREE.PlaneGeometry(dims.x, dims.z);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(floor.color || '#c8a24a'),
        transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(ox + dims.x / 2, floor.yMin, oz + dims.z / 2);
      scene.add(mesh);
    }

    // Zones extrudées, cliquables.
    const floorById = new Map(doc.floors.map((f) => [f.id, f]));
    const zoneMeshes = [];
    for (const zone of doc.zones) {
      const floor = floorById.get(zone.floorId);
      if (!floor) continue;
      const w = zone.rect.x1 - zone.rect.x0 + 1;
      const d = zone.rect.z1 - zone.rect.z0 + 1;
      const h = Math.max(1, floor.yMax - floor.yMin + 1);
      const color = new THREE.Color(zone.color || '#c9a8e8');
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({
          color, transparent: true, opacity: zone.reserved ? 0.12 : 0.28, depthWrite: false,
        }),
      );
      mesh.position.set(ox + zone.rect.x0 + w / 2, floor.yMin + h / 2, oz + zone.rect.z0 + d / 2);
      mesh.userData = { zoneId: zone.id, floorId: zone.floorId };
      scene.add(mesh);
      zoneMeshes.push(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: zone.reserved ? 0.9 : 0.6 }),
      );
      edges.position.copy(mesh.position);
      scene.add(edges);
    }

    // Coffres agrégés : une instance par coffre, taille réelle (1 ou 2 cases).
    const chests = doc.chests.slice(0, CHEST_LIMIT);
    if (chests.length > 0) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#e8c86a') });
      const inst = new THREE.InstancedMesh(geo, mat, chests.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const pos = new THREE.Vector3();
      chests.forEach((c, i) => {
        const alongX = c.kind === 'double' && (c.facing === 'north' || c.facing === 'south');
        const alongZ = c.kind === 'double' && !alongX;
        scale.set(alongX ? 1.85 : 0.9, 0.9, alongZ ? 1.85 : 0.9);
        pos.set(
          ox + c.x + (alongX ? 1 : 0.5),
          c.y + 0.45,
          oz + c.z + (alongZ ? 1 : 0.5),
        );
        m.compose(pos, q, scale);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }

    // Clic sur une zone → retour à la vue 2D de l'étage correspondant.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = null;
    const onDown = (e) => { downAt = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(zoneMeshes, false)[0];
      if (hit) pickRef.current?.(hit.object.userData.zoneId, hit.object.userData.floorId);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((mm) => mm.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [doc, dims]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', minHeight: 420 }} />;
}
