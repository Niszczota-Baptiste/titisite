// Reconnaissance d'items par comparaison d'icônes : chaque case d'un screenshot
// de coffre est rapprochée de nos textures de référence (codex Minefield +
// vanilla 1.18.2). Déterministe — c'est ce qui permet d'identifier les items
// custom que le modèle de vision ne connaît pas. La vision (IA) ne fournit que
// la géométrie de la grille + les quantités ; les NOMS viennent d'ici.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const CODEX_DIR = path.join(process.cwd(), 'public', 'codex');
const CODEX_FILES = [
  { file: 'codex.json', source: 'minefield' },
  { file: 'vanilla/codex.json', source: 'minecraft' },
];

// Distance max (0..1) pour accepter un match ; au-delà → case « à vérifier »
// (nom vide, l'utilisateur complète). Réglable sans redéploiement de code.
const MAX_DIST = Number(process.env.MINECRAFT_MATCH_MAXDIST || 0.02);

// Pixels (grille 16×16) utilisés pour comparer : on ignore le fond transparent
// de l'icône de référence, le coin bas-droit (chiffre de la pile) et la toute
// dernière rangée (barre de durabilité).
function isComparable(x, y, alpha) {
  if (alpha < 128) return false;        // fond de la texture de référence
  if (y >= 10 && x >= 4) return false;  // nombre de la pile (bas-droite)
  if (y >= 14) return false;            // barre de durabilité (tout en bas)
  return true;
}

let _descPromise = null;

async function iconToRgba16(file) {
  // fit:'fill' force 16×16 (les ~10 textures animées 16×48 / 32×32 sont
  // déformées mais négligeables ; elles matcheront juste moins bien).
  const { data } = await sharp(file)
    .ensureAlpha()
    .resize(16, 16, { fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data; // 16*16*4
}

/** Charge (et met en cache) les descripteurs d'icônes du codex. */
export function loadIconDescriptors() {
  if (!_descPromise) {
    _descPromise = (async () => {
      const entries = [];
      for (const { file, source } of CODEX_FILES) {
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemins issus d'une liste fixe (CODEX_FILES), pas d'entrée utilisateur
          const arr = JSON.parse(fs.readFileSync(path.join(CODEX_DIR, file), 'utf8'));
          for (const e of arr) if (e?.icon) entries.push({ ...e, source: e.source || source });
        } catch { /* fichier absent → ignoré */ }
      }
      const out = [];
      // Chargement par lots pour limiter la pression mémoire/CPU.
      const BATCH = 64;
      for (let i = 0; i < entries.length; i += BATCH) {
        const slice = entries.slice(i, i + BATCH);
        const loaded = await Promise.all(slice.map(async (e) => {
          try {
            const rgba = await iconToRgba16(path.join(CODEX_DIR, e.icon));
            const idx = [];
            for (let y = 0; y < 16; y++) {
              for (let x = 0; x < 16; x++) {
                const p = (y * 16 + x) * 4;
                if (isComparable(x, y, rgba[p + 3])) idx.push(p);
              }
            }
            if (idx.length < 16) return null; // icône quasi vide
            return { nomFr: e.nomFr, id: e.id, source: e.source, rgba, idx };
          } catch { return null; }
        }));
        for (const d of loaded) if (d) out.push(d);
      }
      console.log(`[minecraft] icon descriptors chargés : ${out.length}`);
      return out;
    })();
  }
  return _descPromise;
}

// Échantillonne (plus proche voisin) une zone de l'image brute en 16×16 RGBA.
function sampleRgba16(data, W, H, fx, fy, fw, fh) {
  const out = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let sx = Math.round(fx + ((x + 0.5) * fw) / 16);
      let sy = Math.round(fy + ((y + 0.5) * fh) / 16);
      sx = Math.max(0, Math.min(W - 1, sx));
      sy = Math.max(0, Math.min(H - 1, sy));
      const sp = (sy * W + sx) * 4;
      const dp = (y * 16 + x) * 4;
      out[dp] = data[sp]; out[dp + 1] = data[sp + 1]; out[dp + 2] = data[sp + 2]; out[dp + 3] = 255;
    }
  }
  return out;
}

/** Meilleur descripteur pour une case 16×16. Renvoie {nomFr, distance, margin} ou null. */
export function matchSlotRgba(slot, descriptors) {
  let best = null;
  let second = Infinity;
  for (const d of descriptors) {
    let sum = 0;
    for (const p of d.idx) {
      const dr = d.rgba[p] - slot[p];
      const dg = d.rgba[p + 1] - slot[p + 1];
      const db = d.rgba[p + 2] - slot[p + 2];
      sum += dr * dr + dg * dg + db * db;
    }
    const dist = sum / (d.idx.length * 3 * 255 * 255);
    if (!best || dist < best.dist) { second = best ? best.dist : second; best = { d, dist }; }
    else if (dist < second) second = dist;
  }
  if (!best) return null;
  return { nomFr: best.d.nomFr, id: best.d.id, distance: best.dist, margin: second - best.dist };
}

/**
 * À partir du buffer image + la géométrie (grid) et les cases pleines (slots)
 * renvoyées par la vision, identifie chaque item par comparaison d'icônes.
 * Renvoie [{ name, quantity }] — name = '' si aucun match assez sûr (l'utilisateur
 * complétera). Loggue chaque case pour le réglage.
 */
export async function matchChest(buffer, grid, slots) {
  if (!grid || !Array.isArray(slots) || slots.length === 0) return [];
  const cols = Math.max(1, Math.min(54, Math.floor(grid.cols) || 0));
  const rows = Math.max(1, Math.min(54, Math.floor(grid.rows) || 0));
  if (!cols || !rows) return [];

  const descriptors = await loadIconDescriptors();
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  // Géométrie en pixels (grid.x/y/w/h sont des fractions 0..1).
  const gx = grid.x * W;
  const gy = grid.y * H;
  const cw = (grid.w * W) / cols;
  const ch = (grid.h * H) / rows;
  const margin = 0.12; // rogne le cadre de la case

  let matched = 0;
  const items = slots.map((s) => {
    const r = Math.max(0, Math.min(rows - 1, Math.floor(s.row) || 0));
    const c = Math.max(0, Math.min(cols - 1, Math.floor(s.col) || 0));
    const count = Math.max(1, Math.floor(Number(s.count) || 1));
    const ix = gx + c * cw + cw * margin;
    const iy = gy + r * ch + ch * margin;
    const slot = sampleRgba16(data, W, H, ix, iy, cw * (1 - 2 * margin), ch * (1 - 2 * margin));
    const m = matchSlotRgba(slot, descriptors);
    const ok = m && m.distance <= MAX_DIST;
    if (ok) matched += 1;
    console.log(`[minecraft] match r${r}c${c} ×${count} → ${ok ? `"${m.nomFr}"` : '∅'} (d=${m ? m.distance.toFixed(4) : 'n/a'})`);
    return { name: ok ? m.nomFr : '', quantity: count };
  });
  console.log(`[minecraft] match: ${matched}/${items.length} cases identifiées (seuil ${MAX_DIST})`);
  return items;
}
