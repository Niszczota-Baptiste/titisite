import * as THREE from 'three';
import { MODEL_TEXTURE_BASE } from '../../../data/minecraftModels';

// Construit un THREE.Group à partir d'un modèle de bloc résolu (format Minecraft :
// elements = boîtes en coords 0–16, faces référencent #role -> textures{role}).
// Une plane texturée par face présente (les faces absentes du JSON sont omises,
// comme dans Minecraft). UV repris de face.uv (origine haut-gauche, v vers le
// bas → inversé pour three). NearestFilter pour garder le pixel art net.
//
// Renvoie { group, dispose }. Les textures sont mises en cache au niveau module
// et JAMAIS disposées (16px, partagées entre instances) ; seules les géométries
// le sont.

const _texCache = new Map(); // url -> THREE.Texture

function texture(url) {
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

// "#role" -> fichier.png via model.textures (résout une éventuelle indirection).
function resolveTexture(ref, textures) {
  let v = ref;
  for (let i = 0; i < 4 && typeof v === 'string' && v.startsWith('#'); i++) {
    v = textures?.[v.slice(1)];
  }
  return typeof v === 'string' && v ? v : null;
}

// Précharge (et attend) toutes les textures d'un modèle dans le cache partagé —
// nécessaire avant un rendu one-shot (snapshot), sinon les faces sont vides
// (matériau transparent + alphaTest) tant que les PNG ne sont pas chargés.
export function preloadModelTextures(model, base = MODEL_TEXTURE_BASE) {
  const textures = model.textures || {};
  const urls = new Set();
  for (const el of model.elements || []) {
    for (const f of Object.values(el.faces || {})) {
      const file = resolveTexture(f.texture, textures);
      if (file) urls.add(base + file);
    }
  }
  return Promise.all([...urls].map((url) => new Promise((res) => {
    const ex = _texCache.get(url);
    if (ex && ex.image && ex.image.width) { res(); return; }
    new THREE.TextureLoader().load(url, (t) => {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      _texCache.set(url, t);
      res();
    }, undefined, () => res());
  })));
}

// Quad : corners = [bl, br, tr, tl] (Vector3-like), uv = [u1,v1,u2,v2] en 0–16.
function quadGeometry(corners, uv) {
  const [bl, br, tr, tl] = corners;
  const g = new THREE.BufferGeometry();
  const pos = [
    ...bl, ...br, ...tr,
    ...bl, ...tr, ...tl,
  ];
  const [u1, v1, u2, v2] = (uv || [0, 0, 16, 16]).map((n) => n / 16);
  const a = [u1, 1 - v2], b = [u2, 1 - v2], c = [u2, 1 - v1], d = [u1, 1 - v1];
  const uvs = [...a, ...b, ...c, ...a, ...c, ...d];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Coins de chaque face d'une boîte [x1,y1,z1]–[x2,y2,z2] (unités three, centrées),
// ordonnés bottom-left → bottom-right → top-right → top-left, normale sortante.
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

// UV par défaut (Minecraft) dérivée des dimensions de l'élément quand face.uv est
// absent — sinon un slab/quart de bloc étirerait la texture entière. fx..tz en
// coords 0–16 (el.from/el.to bruts).
export function defaultFaceUV(dir, fx, fy, fz, tx, ty, tz) {
  switch (dir) {
    case 'down':  return [fx, fz, tx, tz];
    case 'up':    return [fx, fz, tx, tz];
    case 'north': return [16 - tx, 16 - ty, 16 - fx, 16 - fy];
    case 'south': return [fx, 16 - ty, tx, 16 - fy];
    case 'west':  return [fz, 16 - ty, tz, 16 - fy];
    case 'east':  return [16 - tz, 16 - ty, 16 - fz, 16 - fy];
    default:      return [0, 0, 16, 16];
  }
}

// `tint` = couleur de teinte du bloc (nombre hex) si le bloc est dans la liste
// blanche, sinon null. Seules les faces avec « tintindex » la reçoivent.
export function buildBlockGroup(model, tint = null) {
  const root = new THREE.Group();
  const geometries = [];
  const materials = new Map(); // key (url|color) -> material
  const textures = model.textures || {};

  const material = (url, color) => {
    const key = `${url}|${color}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: texture(url),
        transparent: true,
        alphaTest: 0.5,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        color,
      });
      materials.set(key, m);
    }
    return m;
  };

  const toUnit = (n) => n / 16 - 0.5;

  for (const el of model.elements || []) {
    const [fx, fy, fz] = el.from;
    const [tx, ty, tz] = el.to;
    const x1 = toUnit(fx), y1 = toUnit(fy), z1 = toUnit(fz);
    const x2 = toUnit(tx), y2 = toUnit(ty), z2 = toUnit(tz);

    const elGroup = new THREE.Group();
    for (const [dir, face] of Object.entries(el.faces || {})) {
      const file = resolveTexture(face.texture, textures);
      if (!file) continue;
      const corners = faceCorners(dir, x1, y1, z1, x2, y2, z2);
      if (!corners) continue;
      const geo = quadGeometry(corners, face.uv || defaultFaceUV(dir, fx, fy, fz, tx, ty, tz));
      geometries.push(geo);
      const color = ('tintindex' in face) && tint ? tint : 0xffffff;
      elGroup.add(new THREE.Mesh(geo, material(MODEL_TEXTURE_BASE + file, color)));
    }

    // Rotation d'élément autour d'un pivot (origin en 0–16 → centré).
    if (el.rotation && el.rotation.axis) {
      const { origin = [8, 8, 8], axis, angle = 0 } = el.rotation;
      const pivot = new THREE.Group();
      pivot.position.set(toUnit(origin[0]), toUnit(origin[1]), toUnit(origin[2]));
      elGroup.position.set(-pivot.position.x, -pivot.position.y, -pivot.position.z);
      pivot.rotation[axis] = (angle * Math.PI) / 180;
      pivot.add(elGroup);
      root.add(pivot);
    } else {
      root.add(elGroup);
    }
  }

  return {
    group: root,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
