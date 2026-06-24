import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadModel, loadModelsManifest } from '../../../data/minecraftModels';
import { resolveBlock } from '../../../data/blockCodex';
import { loadBlockstates, loadRenderModel, resolveBlockstate, RENDER_TEXTURE_URL } from '../../../data/blockstates';
import { tintColor } from '../../../data/blockTint';
import {
  MODEL_TEXTURE_URL, blockTexture, buildModelParts, standardMaterial, unitCube,
} from './blueprintGeometry';

// Rendu 3D d'un build importé (export par défaut → React.lazy garde three hors
// bundle). Un InstancedMesh par type de bloc (modèle custom fusionné par texture,
// cube texturé pour le vanilla). Slider de couche Y : « jusqu'à N » (cumulatif,
// via le count des instances) ou « couche N seule » (réécriture du slice).

const upperBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo;
};
const lowerBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
};

// Couleur de repli déterministe quand un bloc n'a pas d'icône (hash de l'id).
function fallbackColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.42, 0.55);
}

export default function BlueprintScene({ data, codex, layer, layerMode, onProgress, selection, onPick, pickEnabled }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null); // { types:[{meshes, ys, mats, n, layout}] }
  // Refs synchronisées à chaque rendu : les écouteurs three.js (stables) lisent
  // toujours la dernière valeur sans recréer la scène.
  const onPickRef = useRef(onPick); onPickRef.current = onPick;
  const selRef = useRef(selection); selRef.current = selection;
  const pickEnabledRef = useRef(pickEnabled); pickEnabledRef.current = pickEnabled;

  // ── Construction de la scène (une fois par data) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !data) return undefined;
    let cancelled = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const resize = () => {
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0a1c');
    const { x: sx, y: sy, z: sz } = data.size;
    const cx = sx / 2, cy = sy / 2, cz = sz / 2;
    const span = Math.max(sx, sy, sz);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, span * 8 + 100);
    camera.position.set(span * 0.9, span * 0.8, span * 1.1);
    resize();

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(span, span * 1.5, span * 0.7);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x99a8d8, 0.5);
    fill.position.set(-span, span * 0.6, -span);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = span * 6 + 40;
    // En mode sélection, le clic droit sert au picking (coin A) → on le retire
    // d'OrbitControls. Le clic gauche reste la rotation (mais un clic SANS glisser
    // pose le coin B, cf. plus bas).
    if (pickEnabled) controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };

    // ── Sélection : picking (clic droit = coin A, clic gauche = coin B) + boîte ──
    const dataMin = data.min || { x: 0, y: 0, z: 0 };
    const raycaster = new THREE.Raycaster();
    let selBox = null, selEdges = null;
    const disposeSel = () => {
      for (const o of [selBox, selEdges]) { if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); } }
      selBox = selEdges = null;
    };
    const updateSelection = () => {
      disposeSel();
      const sel = selRef.current;
      if (!sel || !sel.min || !sel.max) return;
      const lo = { x: Math.min(sel.min.x, sel.max.x), y: Math.min(sel.min.y, sel.max.y), z: Math.min(sel.min.z, sel.max.z) };
      const hi = { x: Math.max(sel.min.x, sel.max.x), y: Math.max(sel.min.y, sel.max.y), z: Math.max(sel.min.z, sel.max.z) };
      // coords monde → coords scène (un bloc occupe [rel-half, rel+1-half]).
      const min = new THREE.Vector3(lo.x - dataMin.x - cx, lo.y - dataMin.y - cy, lo.z - dataMin.z - cz);
      const max = new THREE.Vector3(hi.x - dataMin.x + 1 - cx, hi.y - dataMin.y + 1 - cy, hi.z - dataMin.z + 1 - cz);
      const size = new THREE.Vector3().subVectors(max, min);
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z);
      selBox = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.1, depthWrite: false }));
      selEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffd24a }));
      scene.add(selBox); scene.add(selEdges);
    };

    // Renvoie la coordonnée MONDE du bloc visé par le curseur, ou null.
    const pickCoord = (ev) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const meshes = [];
      for (const t of (apiRef.current?.types || [])) if (t) for (const im of t.meshes) meshes.push(im);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      // On entre d'un cheveu dans le bloc le long du rayon pour tomber sur la
      // bonne cellule, puis on repasse en coords monde absolues.
      const p = hits[0].point.clone().addScaledVector(raycaster.ray.direction, 0.02);
      const cl = (v, hiB) => Math.max(0, Math.min(hiB - 1, v));
      return {
        x: cl(Math.floor(p.x + cx), sx) + dataMin.x,
        y: cl(Math.floor(p.y + cy), sy) + dataMin.y,
        z: cl(Math.floor(p.z + cz), sz) + dataMin.z,
      };
    };

    let downX = 0, downY = 0, downBtn = -1;
    let yDrag = null; // { corner, x, z, y0, downY } pendant un shift+glissé vertical
    const clampY = (y) => Math.max(dataMin.y, Math.min(dataMin.y + sy - 1, y));
    const onPointerDown = (e) => {
      downX = e.clientX; downY = e.clientY; downBtn = e.button;
      // Shift + clic = on fixe X/Z au bloc visé puis le glissé vertical règle Y
      // (permet de placer un coin AU-DESSUS de la surface, hors de portée du clic).
      if (pickEnabledRef.current && e.shiftKey && (e.button === 0 || e.button === 2)) {
        const c = pickCoord(e);
        if (c) { yDrag = { corner: e.button === 2 ? 'A' : 'B', x: c.x, z: c.z, y0: c.y, downY: e.clientY }; controls.enabled = false; }
      }
    };
    const onPointerMove = (e) => {
      if (!yDrag || !onPickRef.current) return;
      const y = clampY(yDrag.y0 + Math.round((yDrag.downY - e.clientY) / 6)); // vers le haut = +Y
      onPickRef.current(yDrag.corner, { x: yDrag.x, y, z: yDrag.z });
    };
    const onPointerUp = (e) => {
      if (yDrag) { yDrag = null; controls.enabled = true; return; }
      if (!pickEnabledRef.current || !onPickRef.current || e.button !== downBtn) return;
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return; // glissé → rotation, pas un clic
      if (e.button === 0 || e.button === 2) { const c = pickCoord(e); if (c) onPickRef.current(e.button === 2 ? 'A' : 'B', c); }
    };
    const onContext = (e) => { if (pickEnabledRef.current) e.preventDefault(); };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('contextmenu', onContext);

    // ── Déplacement libre de la caméra au clavier (ZQSD/WASD) ──
    // Translate caméra + cible sur le plan horizontal, relatif à la vue. R/F =
    // monter/descendre. Ignoré quand on tape dans un champ.
    const moveKeys = new Set();
    const MOVE = new Set(['z', 'w', 's', 'q', 'a', 'd', 'r', 'f']);
    const onKeyDown = (e) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (MOVE.has(k)) moveKeys.add(k);
    };
    const onKeyUp = (e) => moveKeys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const fwdV = new THREE.Vector3();
    const rightV = new THREE.Vector3();
    const moveV = new THREE.Vector3();
    const applyMove = () => {
      if (!moveKeys.size) return;
      fwdV.subVectors(controls.target, camera.position); fwdV.y = 0;
      if (fwdV.lengthSq() > 1e-6) fwdV.normalize();
      rightV.crossVectors(fwdV, camera.up).normalize();
      moveV.set(0, 0, 0);
      if (moveKeys.has('z') || moveKeys.has('w')) moveV.add(fwdV);
      if (moveKeys.has('s')) moveV.sub(fwdV);
      if (moveKeys.has('d')) moveV.add(rightV);
      if (moveKeys.has('q') || moveKeys.has('a')) moveV.sub(rightV);
      if (moveKeys.has('r')) moveV.y += 1;
      if (moveKeys.has('f')) moveV.y -= 1;
      if (moveV.lengthSq() === 0) return;
      moveV.normalize().multiplyScalar(Math.max(0.8, span * 0.02));
      camera.position.add(moveV);
      controls.target.add(moveV);
    };

    // Regroupe les positions par index de palette.
    const { palette, blocks } = data;
    const byType = palette.map(() => []);
    for (let i = 0; i < blocks.length; i += 4) {
      byType[blocks[i + 3]].push(blocks[i], blocks[i + 1], blocks[i + 2]); // x,y,z (relatifs)
    }

    const types = [];
    apiRef.current = { types, span, updateSelection };
    updateSelection(); // boîte de sélection initiale (avant le rendu des blocs)
    const dummy = new THREE.Object3D();

    // Crée les InstancedMesh d'un type à partir d'une liste de specs {geometry, material}.
    const makeType = (positions, specs, rot = [0, 0, 0]) => {
      // tri des instances par Y croissant (pour le slider)
      const n = positions.length / 3;
      const order = Array.from({ length: n }, (_, k) => k)
        .sort((a, b) => positions[a * 3 + 1] - positions[b * 3 + 1]);
      const ys = new Int32Array(n);
      const mats = new Float32Array(n * 16); // matrices en ordre trié
      // Orientation du bloc (axis) appliquée à toutes les instances du type.
      dummy.rotation.set(
        THREE.MathUtils.degToRad(rot[0] || 0),
        THREE.MathUtils.degToRad(rot[1] || 0),
        THREE.MathUtils.degToRad(rot[2] || 0),
      );
      for (let k = 0; k < n; k++) {
        const src = order[k];
        const px = positions[src * 3] + 0.5 - cx;
        const py = positions[src * 3 + 1] + 0.5 - cy;
        const pz = positions[src * 3 + 2] + 0.5 - cz;
        ys[k] = positions[src * 3 + 1];
        dummy.position.set(px, py, pz);
        dummy.updateMatrix();
        dummy.matrix.toArray(mats, k * 16);
      }
      dummy.rotation.set(0, 0, 0);
      const meshes = specs.map(({ geometry, material }) => {
        const im = new THREE.InstancedMesh(geometry, material, n);
        im.instanceMatrix.array.set(mats);
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        scene.add(im);
        return im;
      });
      types.push({ meshes, ys, mats, n, layout: 'sorted' });
    };

    // Construit les specs : résolution blockstate (variants/multipart) → modèles
    // orientés ; repli sur le modèle codex custom puis le cube texturé.
    const build = async () => {
      const [states] = await Promise.all([loadBlockstates(), loadModelsManifest()]);
      for (let p = 0; p < palette.length && !cancelled; p++) {
        const positions = byType[p];
        if (positions.length === 0) { types.push(null); continue; }
        const pe = palette[p];
        const isNew = pe && typeof pe === 'object' && 'props' in pe;
        const blockId = typeof pe === 'string' ? pe : pe.name;
        const props = isNew ? pe.props : null;
        const legacyRot = (pe && pe.rot) || [0, 0, 0];
        const entry = resolveBlock(codex, blockId);
        const tint = tintColor(blockId); // null sauf liste blanche
        let specs = [];
        let baked = false;

        // 1) Rendu orienté via blockstate (uniquement pour les builds récents qui
        //    portent l'état complet — `props` présent).
        if (isNew) {
          const resolved = resolveBlockstate(states, blockId, props);
          if (resolved) {
            for (const part of resolved) {
              const model = await loadRenderModel(part.model);
              if (model && Array.isArray(model.elements)) {
                for (const mp of buildModelParts(model, { rotX: part.x, rotY: part.y, tint })) {
                  specs.push({
                    geometry: mp.geometry,
                    material: standardMaterial(RENDER_TEXTURE_URL(mp.textureFile), mp.color),
                  });
                }
              }
            }
            if (specs.length) baked = true; // rotation déjà dans la géométrie
          }
        }

        // 2) Repli : modèle codex custom (Minefield) à orientation par défaut.
        if (specs.length === 0 && blockId.startsWith('minefield:')) {
          const model = await loadModel(entry.id);
          if (model && model.render === 'model') {
            specs = buildModelParts(model, { tint }).map((part) => ({
              geometry: part.geometry,
              material: standardMaterial(MODEL_TEXTURE_URL(part.textureFile), part.color),
            }));
          }
        }

        // 3) Repli ultime : cube texturé (icône) ou couleur de hash.
        if (specs.length === 0) {
          const mat = entry.icon
            ? new THREE.MeshStandardMaterial({ map: tex(entry.icon), roughness: 1, metalness: 0, transparent: true, alphaTest: 0.5 })
            : new THREE.MeshStandardMaterial({ color: fallbackColor(blockId), roughness: 1, metalness: 0 });
          specs = [{ geometry: unitCube(), material: mat }];
        }

        if (cancelled) break;
        makeType(positions, specs, baked ? [0, 0, 0] : legacyRot);
        onProgress?.((p + 1) / palette.length);
      }
      if (!cancelled) applyLayer();
    };

    const tex = (url) => {
      const t = blockTexture(url);
      return t;
    };

    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); applyMove(); controls.update(); renderer.render(scene, camera); };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    build();

    // expose applyLayer via ref for the layer effect
    apiRef.current.applyLayer = applyLayer;
    function applyLayer() {
      const st = apiRef.current;
      if (!st) return;
      const L = st.layerRef ?? (sy - 1);
      const mode = st.modeRef ?? 'cumulative';
      for (const t of st.types) {
        if (!t) continue;
        if (mode === 'cumulative') {
          if (t.layout !== 'sorted') {
            for (const im of t.meshes) { im.instanceMatrix.array.set(t.mats); im.instanceMatrix.needsUpdate = true; }
            t.layout = 'sorted';
          }
          const count = upperBound(t.ys, L);
          for (const im of t.meshes) im.count = count;
        } else {
          const lo = lowerBound(t.ys, L);
          const hi = upperBound(t.ys, L);
          const k = hi - lo;
          for (const im of t.meshes) {
            im.instanceMatrix.array.set(t.mats.subarray(lo * 16, hi * 16), 0);
            im.instanceMatrix.needsUpdate = true;
            im.count = k;
          }
          t.layout = 'slice';
        }
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      disposeSel();
      controls.dispose();
      scene.traverse((o) => {
        if (o.isInstancedMesh) { o.geometry.dispose?.(); o.material.dispose?.(); }
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line
  }, [data, codex]);

  // ── Mise à jour de la couche ──
  useEffect(() => {
    const st = apiRef.current;
    if (!st) return;
    st.layerRef = layer;
    st.modeRef = layerMode;
    st.applyLayer?.();
  }, [layer, layerMode]);

  // ── Mise à jour de la boîte de sélection ──
  useEffect(() => { apiRef.current?.updateSelection?.(); }, [selection]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
