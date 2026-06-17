import * as THREE from 'three';
import { MODEL_TEXTURE_BASE } from '../../../data/minecraftModels';
import { defaultFaceUV } from '../block3d/buildBlock';

// Géométries pour le rendu instancié d'un build : un cube unité texturé pour le
// vanilla, et — pour les blocs custom Minefield à modèle — la géométrie du
// modèle fusionnée PAR TEXTURE (rotations d'éléments bakées dans les sommets)
// afin de pouvoir l'instancier (un InstancedMesh par groupe de texture).
//
// Réutilise le format de modèle de buildBlock.js (elements 0–16, faces #role).

const FOLIAGE_TINT = 0x6a9a3b;
const _texCache = new Map();

export function blockTexture(url) {
  let t = _texCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    _texCache.set(url, t);
  }
  return t;
}

export function standardMaterial(url, tinted) {
  return new THREE.MeshStandardMaterial({
    map: blockTexture(url),
    transparent: true,
    alphaTest: 0.5,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    color: tinted ? FOLIAGE_TINT : 0xffffff,
  });
}

// Cube unité (1×1×1) centré — chaque face porte la texture en entier (icône
// vanilla en approximation). Réutilisé pour tous les blocs « cube ».
let _cube = null;
export function unitCube() {
  if (!_cube) _cube = new THREE.BoxGeometry(1, 1, 1);
  return _cube;
}

function resolveTexture(ref, textures) {
  let v = ref;
  for (let i = 0; i < 4 && typeof v === 'string' && v.startsWith('#'); i++) v = textures?.[v.slice(1)];
  return typeof v === 'string' && v ? v : null;
}

function faceCorners(dir, x1, y1, z1, x2, y2, z2) {
  switch (dir) {
    case 'south': return [[x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
    case 'north': return [[x2, y1, z1], [x1, y1, z1], [x1, y2, z1], [x2, y2, z1]];
    case 'east':  return [[x2, y1, z2], [x2, y1, z1], [x2, y2, z1], [x2, y2, z2]];
    case 'west':  return [[x1, y1, z1], [x1, y1, z2], [x1, y2, z2], [x1, y2, z1]];
    case 'up':    return [[x1, y2, z2], [x2, y2, z2], [x2, y2, z1], [x1, y2, z1]];
    case 'down':  return [[x1, y1, z1], [x2, y1, z1], [x2, y1, z2], [x1, y1, z2]];
    default:      return null;
  }
}

// Modèle (render "model") → [{ geometry, textureFile, tinted }] : une géométrie
// fusionnée non-indexée par texture, prête pour un InstancedMesh. `opts.rotX` /
// `opts.rotY` = rotation blockstate (degrés, multiples de 90) bakée dans les
// sommets (sens Minecraft = horaire → angle three négatif).
export function buildModelParts(model, opts = {}) {
  const { rotX = 0, rotY = 0 } = opts;
  const textures = model.textures || {};
  const groups = new Map(); // key (file|tint) -> { file, tinted, pos:[], uv:[] }
  const toUnit = (n) => n / 16 - 0.5;
  const tmp = new THREE.Vector3();

  // Rotation au niveau du bloc (autour du centre, modèle déjà centré en 0).
  let blockMat = null;
  if (rotX || rotY) {
    blockMat = new THREE.Matrix4()
      .makeRotationY(-(rotY * Math.PI) / 180)
      .multiply(new THREE.Matrix4().makeRotationX(-(rotX * Math.PI) / 180));
  }

  for (const el of model.elements || []) {
    const [fx, fy, fz] = el.from;
    const [tx, ty, tz] = el.to;
    const x1 = toUnit(fx), y1 = toUnit(fy), z1 = toUnit(fz);
    const x2 = toUnit(tx), y2 = toUnit(ty), z2 = toUnit(tz);

    // Matrice de rotation d'élément (bakée), pré-multipliée par la rotation bloc.
    let mat = null;
    if (el.rotation && el.rotation.axis) {
      const { origin = [8, 8, 8], axis, angle = 0 } = el.rotation;
      const o = new THREE.Vector3(toUnit(origin[0]), toUnit(origin[1]), toUnit(origin[2]));
      const rot = new THREE.Matrix4();
      const rad = (angle * Math.PI) / 180;
      if (axis === 'x') rot.makeRotationX(rad);
      else if (axis === 'y') rot.makeRotationY(rad);
      else rot.makeRotationZ(rad);
      mat = new THREE.Matrix4()
        .makeTranslation(o.x, o.y, o.z)
        .multiply(rot)
        .multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
    }
    if (blockMat) mat = mat ? blockMat.clone().multiply(mat) : blockMat;

    for (const [dir, face] of Object.entries(el.faces || {})) {
      const file = resolveTexture(face.texture, textures);
      if (!file) continue;
      const corners = faceCorners(dir, x1, y1, z1, x2, y2, z2);
      if (!corners) continue;
      const tinted = 'tintindex' in face;
      const key = `${file}|${tinted ? 1 : 0}`;
      let g = groups.get(key);
      if (!g) { g = { file, tinted, pos: [], uv: [] }; groups.set(key, g); }

      const pts = corners.map(([cx, cy, cz]) => {
        if (!mat) return [cx, cy, cz];
        tmp.set(cx, cy, cz).applyMatrix4(mat);
        return [tmp.x, tmp.y, tmp.z];
      });
      const [bl, br, tr, tl] = pts;
      g.pos.push(...bl, ...br, ...tr, ...bl, ...tr, ...tl);
      const [u1, v1, u2, v2] = (face.uv || defaultFaceUV(dir, fx, fy, fz, tx, ty, tz)).map((n) => n / 16);
      const a = [u1, 1 - v2], b = [u2, 1 - v2], c = [u2, 1 - v1], d = [u1, 1 - v1];
      g.uv.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }

  const parts = [];
  for (const g of groups.values()) {
    if (g.pos.length === 0) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.computeVertexNormals();
    parts.push({ geometry: geo, textureFile: g.file, tinted: g.tinted });
  }
  return parts;
}

export const MODEL_TEXTURE_URL = (file) => MODEL_TEXTURE_BASE + file;
