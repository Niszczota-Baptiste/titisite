import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATLAS_ZOOM, DETAIL_MAX_SPAN, DETAIL_ZOOM, bearingDirection, fitTiles,
  imagePlacement, measureDistance, tileParent, tileRect, tileSize, tilesInView,
  toPct, worldToTile, zoomAt, zoomForView,
} from '../src/components/lore/mapMath.js';

// La carte affiche le nord en haut : Z croît vers le bas de l'écran. Ces
// tests verrouillent la conversion relèvement → direction monde et le
// placement de l'image calibrée par les deux points de référence de Nostra.

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('bearingDirection — 0° = nord = Z décroissant', () => {
  it('les 4 axes', () => {
    let d = bearingDirection(0);
    close(d.dx, 0); close(d.dz, -1);   // nord : Z décroît
    d = bearingDirection(90);
    close(d.dx, 1); close(d.dz, 0);    // est : X croît
    d = bearingDirection(180);
    close(d.dx, 0); close(d.dz, 1);    // sud : Z croît
    d = bearingDirection(270);
    close(d.dx, -1); close(d.dz, 0);   // ouest : X décroît
  });
  it('diagonale NE', () => {
    const d = bearingDirection(45);
    close(d.dx, Math.SQRT1_2); close(d.dz, -Math.SQRT1_2);
  });
});

describe('imagePlacement — calibration deux points du render Nostra', () => {
  const NOSTRA = { imgXLeft: -5353, imgXRight: 4646, imgZBottom: -636 };
  it('largeur 9999 blocs, bord bas ancré, le haut monte vers -Z', () => {
    // Ratio h/w 0.5 : une image deux fois plus large que haute.
    const p = imagePlacement(NOSTRA, 0.5);
    assert.equal(p.spanX, 9999);
    close(p.spanZ, 4999.5);
    assert.equal(p.left, -5353);
    close(p.top, -636 - 4999.5); // le haut de l'image est PLUS AU NORD (Z plus petit)
  });
  it('le centre X de l\'image tombe sur l\'axe de KotaNostra', () => {
    const p = imagePlacement(NOSTRA, 1);
    close(p.left + p.spanX / 2, -353.5); // KotaNostra : x = -353
  });
  it('calibration incomplète ou invalide → null', () => {
    assert.equal(imagePlacement({ imgXLeft: null, imgXRight: 4646, imgZBottom: -636 }, 1), null);
    assert.equal(imagePlacement({ imgXLeft: 10, imgXRight: -10, imgZBottom: 0 }, 1), null); // gauche > droite
    assert.equal(imagePlacement(NOSTRA, 0), null);
  });
});

describe('grille des cartes Minecraft (tuiles 128×128)', () => {
  it('un joueur posé en (0,0) est au CENTRE de la tuile (0,0)', () => {
    assert.deepEqual(worldToTile(0, 0), { tileX: 0, tileZ: 0 });
    const r = tileRect(0, 0);
    assert.deepEqual(r, { left: -64, top: -64, size: 128 });
    // (0,0) est bien au centre du rectangle.
    close(r.left + r.size / 2, 0);
    close(r.top + r.size / 2, 0);
  });
  it('bornes de tuile : -64 appartient à 0, -65 à la tuile -1', () => {
    assert.equal(worldToTile(-64, 0).tileX, 0);
    assert.equal(worldToTile(-65, 0).tileX, -1);
    assert.equal(worldToTile(63, 0).tileX, 0);
    assert.equal(worldToTile(64, 0).tileX, 1);
  });
  it('coordonnées négatives : pas d\'arrondi vers zéro', () => {
    // KotaNostra (-353, -5636) : floor, pas troncature (qui donnerait -2/-43).
    assert.deepEqual(worldToTile(-353, -5636), { tileX: -3, tileZ: -44 });
    const r = tileRect(-3, -44);
    assert.ok(-353 >= r.left && -353 < r.left + r.size, 'X dans la tuile');
    assert.ok(-5636 >= r.top && -5636 < r.top + r.size, 'Z dans la tuile');
  });
  it('tilesInView couvre la vue et se coupe quand on dézoome trop', () => {
    const tiles = tilesInView({ cx: 0, cz: 0, span: 256 });
    assert.ok(tiles.length >= 4 && tiles.length <= 9, `attendu 4..9, obtenu ${tiles.length}`);
    assert.ok(tiles.some((t) => t.tileX === 0 && t.tileZ === 0));
    assert.equal(tilesInView({ cx: 0, cz: 0, span: 200000 }).length, 0);
  });
});

// Les deux couches du fond : l'atlas (zoom 2, 512×512) et le détail (zoom 0).
// L'invariant qui rend l'empilement possible est que le décalage de -64 vaut
// aux DEUX niveaux — c'est la formule du jeu :
//   i = 128·2ⁿ ; centre = floor((pos+64)/i)·i + i/2 - 64
// Si ces tests tombent, les deux couches se décalent et tout le fond ment.
describe('deux niveaux de zoom : atlas 512 et détail 128', () => {
  it('tailles et cohérence des constantes', () => {
    assert.equal(tileSize(DETAIL_ZOOM), 128);
    assert.equal(tileSize(ATLAS_ZOOM), 512);
    assert.equal(tileSize(), 128); // défaut = niveau 0, compat des appels existants
  });

  it('la case 512 (0,0) est celle du jeu : centre 192, X ∈ [-64, 448)', () => {
    // Reproduction directe de la formule Minecraft pour scale = 2 en (0,0).
    const i = 512;
    const centre = Math.floor((0 + 64) / i) * i + i / 2 - 64;
    assert.equal(centre, 192);
    const r = tileRect(0, 0, ATLAS_ZOOM);
    assert.deepEqual(r, { left: -64, top: -64, size: 512 });
    assert.equal(r.left, centre - i / 2);
    assert.equal(r.left + r.size, centre + i / 2);
  });

  it('emboîtement EXACT : une case 512 = 4×4 cases 128, jamais à cheval', () => {
    for (const j of [-9, -4, -1, 0, 1, 7]) {
      const atlas = tileRect(j, j, ATLAS_ZOOM);
      // Les quatre cases fines du bord gauche/haut et du bord droit/bas.
      const first = tileRect(4 * j, 4 * j, DETAIL_ZOOM);
      const last = tileRect(4 * j + 3, 4 * j + 3, DETAIL_ZOOM);
      assert.equal(first.left, atlas.left, `bord gauche aligné (case ${j})`);
      assert.equal(first.top, atlas.top, `bord haut aligné (case ${j})`);
      assert.equal(last.left + last.size, atlas.left + atlas.size, `bord droit aligné (case ${j})`);
      assert.equal(last.top + last.size, atlas.top + atlas.size, `bord bas aligné (case ${j})`);
    }
  });

  it('un point du monde tombe dans des cases parent/enfant cohérentes', () => {
    // KotaNostra (-353, -5636) : les deux niveaux doivent le contenir, et la
    // case fine doit être un enfant de la case d'atlas.
    const fine = worldToTile(-353, -5636, DETAIL_ZOOM);
    const gros = worldToTile(-353, -5636, ATLAS_ZOOM);
    assert.deepEqual(fine, { tileX: -3, tileZ: -44 });
    assert.deepEqual(tileParent(fine.tileX, fine.tileZ, DETAIL_ZOOM, ATLAS_ZOOM), gros);
    const r = tileRect(gros.tileX, gros.tileZ, ATLAS_ZOOM);
    assert.ok(-353 >= r.left && -353 < r.left + r.size, 'X dans la case d\'atlas');
    assert.ok(-5636 >= r.top && -5636 < r.top + r.size, 'Z dans la case d\'atlas');
  });

  it('tileParent : floor, pas troncature (le quadrant négatif se décalerait)', () => {
    // -1 / 4 tronqué donnerait 0 : la case fine -1 serait rattachée à l'atlas 0
    // au lieu de -1, et l'image se poserait un écran plus loin.
    assert.deepEqual(tileParent(-1, -1, 0, 2), { tileX: -1, tileZ: -1 });
    assert.deepEqual(tileParent(-4, -4, 0, 2), { tileX: -1, tileZ: -1 });
    assert.deepEqual(tileParent(-5, -5, 0, 2), { tileX: -2, tileZ: -2 });
    assert.deepEqual(tileParent(3, 3, 0, 2), { tileX: 0, tileZ: 0 });
    assert.deepEqual(tileParent(4, 4, 0, 2), { tileX: 1, tileZ: 1 });
  });

  it('tilesInView : à vue égale, 16× moins de cases d\'atlas que de cases fines', () => {
    const view = { cx: 0, cz: 0, span: 2048 };
    const fines = tilesInView(view, { zoom: DETAIL_ZOOM });
    const gros = tilesInView(view, { zoom: ATLAS_ZOOM });
    assert.ok(fines.length > gros.length * 8, `${fines.length} fines vs ${gros.length} d'atlas`);
    // Le budget coupe la couche fine ~4× plus tôt (par axe) que l'atlas :
    // c'est ce qui évite de peindre des milliers de <img> en vue large, tout
    // en gardant un fond visible. À 10 000 blocs de large le détail est coupé,
    // l'atlas tient encore.
    const large = { cx: 0, cz: 0, span: 10000 };
    assert.equal(tilesInView(large, { zoom: DETAIL_ZOOM }).length, 0);
    assert.ok(tilesInView(large, { zoom: ATLAS_ZOOM }).length > 0);
    // À l'échelle du monde les deux sont coupées — c'est le régime du render
    // global calibré, pas celui des tuiles.
    assert.equal(tilesInView({ cx: 0, cz: 0, span: 200000 }, { zoom: ATLAS_ZOOM }).length, 0);
  });

  it('zoomForView : le seuil décide du niveau que la vue regarde', () => {
    assert.equal(zoomForView({ span: DETAIL_MAX_SPAN }), DETAIL_ZOOM);
    assert.equal(zoomForView({ span: DETAIL_MAX_SPAN + 1 }), ATLAS_ZOOM);
    assert.equal(zoomForView({ span: 512 }), DETAIL_ZOOM);
  });
});

describe('fitTiles — cadrage sur l\'union des cases, pas sur leurs centres', () => {
  it('englobe les BORDS : une case seule est entièrement visible', () => {
    const v = fitTiles([{ tileX: 0, tileZ: 0 }], ATLAS_ZOOM, { pad: 1, minSpan: 0 });
    assert.equal(v.span, 512);        // la case entière, pas un point
    assert.equal(v.cx, 192);          // centre réel de la case 512 (0,0)
    assert.equal(v.cz, 192);
  });
  it('deux cases opposées : le span couvre les deux, marge comprise', () => {
    const v = fitTiles([{ tileX: 0, tileZ: 0 }, { tileX: 2, tileZ: 1 }], ATLAS_ZOOM, { pad: 1, minSpan: 0 });
    // X : de -64 à 2·512+512-64 = 1472 → 1536 de large ; Z : 1024.
    assert.equal(v.span, 1536);
    assert.equal(v.cx, (-64 + 1472) / 2);
    assert.equal(v.cz, (-64 + 960) / 2);
  });
  it('lot vide → null (l\'appelant retombe sur le cadrage suivant)', () => {
    assert.equal(fitTiles([], ATLAS_ZOOM), null);
    assert.equal(fitTiles(undefined, ATLAS_ZOOM), null);
  });
});

describe('toPct / measureDistance / zoomAt', () => {
  const view = { cx: 0, cz: 0, span: 1000 };
  it('le centre est à 50/50, le nord au-dessus', () => {
    assert.deepEqual(toPct(view, 0, 0), { left: 50, top: 50 });
    const north = toPct(view, 0, -250);
    close(north.top, 25); // Z plus petit → plus haut à l'écran
    const east = toPct(view, 250, 0);
    close(east.left, 75);
  });
  it('measureDistance : hypoténuse X/Z', () => {
    close(measureDistance({ x: 0, z: 0 }, { x: 30, z: 40 }), 50);
  });
  it('zoomAt garde le point sous le curseur immobile', () => {
    const world = { x: 200, z: -100 };
    const before = toPct(view, world.x, world.z);
    const zoomed = zoomAt(view, world, 0.5);
    const after = toPct(zoomed, world.x, world.z);
    close(before.left, after.left);
    close(before.top, after.top);
    assert.equal(zoomed.span, 500);
  });
  it('zoomAt respecte les bornes de span', () => {
    assert.equal(zoomAt(view, { x: 0, z: 0 }, 1e9).span, 200000);
    assert.equal(zoomAt(view, { x: 0, z: 0 }, 1e-9).span, 32);
  });
});
