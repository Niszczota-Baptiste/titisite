import * as THREE from 'three';
import { loadModel } from './minecraftModels';
import { buildBlockGroup, preloadModelTextures } from '../components/project/block3d/buildBlock';

// Vignette 3D statique d'un bloc (dataURL PNG), rendue par UN renderer WebGL
// partagé puis mise en cache par id : permet d'afficher TOUS les items de
// l'inventaire en 3D en permanence sans ouvrir un contexte WebGL par item. La
// rotation live reste gérée séparément (Block3D au survol).

let _renderer = null;
const _cache = new Map(); // `${id}@${size}` -> Promise<dataURL|null>

function getRenderer(size) {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    _renderer.setPixelRatio(1);
    _renderer.setClearColor(0x000000, 0);
  }
  _renderer.setSize(size, size, false);
  return _renderer;
}

export function blockThumbnail(id, size = 96) {
  const key = `${id}@${size}`;
  if (_cache.has(key)) return _cache.get(key);
  const p = loadModel(id).then(async (model) => {
    if (!model || model.render !== 'model') return null; // cube/flat → icône plate
    await preloadModelTextures(model); // sinon snapshot vide (textures pas prêtes)
    const r = getRenderer(size);
    const scene = new THREE.Scene();
    const h = 0.92;
    const cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, 100);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.1);
    d.position.set(0.6, 1.2, 0.8);
    scene.add(d);
    const { group, dispose } = buildBlockGroup(model);
    group.rotation.x = 0.52;
    group.rotation.y = 0.7;
    scene.add(group);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    dispose();
    return url;
  }).catch(() => null);
  _cache.set(key, p);
  return p;
}
