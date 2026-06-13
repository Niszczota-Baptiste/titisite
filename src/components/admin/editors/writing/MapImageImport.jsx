import { useRef, useState } from 'react';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import { MAX_H } from '../../../writing/map/terrain';
import { Button } from '../../ui';
import { blockLabel, selectStyle } from './widgets';

// Import a Minecraft-style satellite map image and pre-fill the painter grid.
// Everything runs client-side on a <canvas>: the image is downsampled to the
// map's configured grid size, each cell's average colour is snapped to the
// nearest entry of the colour→biome table below, then turned into a biome +
// rough height. The result is a base the user refines with the brush — POI /
// labels (text on the image) are out of scope.

// Default colour→biome table. Colours are the *image* colours (editable in the
// UI); biomes are preset keys from presets.js. Two blues both resolve to water
// (there is no shallow-water preset) yet stay distinct entries so a light-blue
// pixel never snaps onto a pale land biome.
export const DEFAULT_BIOME_MAP = [
  { color: '#27406f', biome: 'ocean', hint: 'Bleu profond → océan' },
  { color: '#3f6fb0', biome: 'ocean', hint: 'Bleu clair → eau peu profonde / rivière' },
  { color: '#8bbf57', biome: 'plaines', hint: 'Vert clair → plaine' },
  { color: '#558f38', biome: 'foret', hint: 'Vert moyen → forêt' },
  { color: '#2f5a2b', biome: 'taiga', hint: 'Vert foncé → taïga / forêt dense' },
  { color: '#eef1f5', biome: 'neige', hint: 'Blanc / gris clair → neige' },
  { color: '#d9c98c', biome: 'desert', hint: 'Beige / sable → plage / désert' },
  { color: '#8b8b91', biome: 'montagne', hint: 'Gris → montagne / pierre' },
  { color: '#b3601f', biome: 'badlands', hint: 'Brun-orangé → mesa' },
  { color: '#4d5a30', biome: 'marais', hint: 'Vert olive sombre → marais' },
];

// Relief is only a rough base: water is carved one step below the water level
// so it renders as sea/river, mountains poke up, everything else sits flat at
// the water level. The user then sculpts with the élever / abaisser brushes.
const WATER_BIOMES = new Set(['ocean']);
const HIGH_BIOMES = new Set(['montagne', 'collines', 'pics_geles']);

function heightForBiome(biome, waterLevel) {
  if (WATER_BIOMES.has(biome)) return Math.max(0, waterLevel - 1);
  if (HIGH_BIOMES.has(biome)) return Math.min(MAX_H, waterLevel + 4);
  return waterLevel;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Downsample to size×size (stretched to fill the square grid), read each cell's
// average colour and snap it to the nearest table colour → biome + height. The
// canvas getImageData is row-major like the terrain grid (index = j*size + i),
// so the import keeps the same orientation as the source image.
function sampleImage(img, size, mapping, waterLevel) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const swatches = mapping.map((m) => hexToRgb(m.color));
  const height = new Array(size * size);
  const biome = new Array(size * size);
  for (let k = 0; k < size * size; k++) {
    const p = k * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s < swatches.length; s++) {
      const d = (r - swatches[s][0]) ** 2 + (g - swatches[s][1]) ** 2 + (b - swatches[s][2]) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
    const key = mapping[best].biome;
    biome[k] = key;
    height[k] = heightForBiome(key, waterLevel);
  }
  return { height, biome };
}

const swatchStyle = {
  width: 44, height: 30, padding: 2, background: 'none',
  border: '1px solid rgba(80,50,130,0.3)', borderRadius: 6, cursor: 'pointer',
};
const hintStyle = { fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(200,192,216,0.85)' };

export function MapImageImport({ size, waterLevel, biomeOptions, onImport }) {
  const inputRef = useRef(null);
  const [mapping, setMapping] = useState(() => DEFAULT_BIOME_MAP.map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  const mobile = useIsMobile(720);

  const setRow = (i, patch) => setMapping((m) => m.map((row, k) => (k === i ? { ...row, ...patch } : row)));

  const pick = (file) => {
    if (!file) return;
    setErr('');
    setBusy(true);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const { height, biome } = sampleImage(img, size, mapping, waterLevel);
        onImport(height, biome);
      } catch {
        setErr('Échantillonnage impossible — réessaie avec une autre image.');
      } finally {
        URL.revokeObjectURL(url);
        setBusy(false);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); setBusy(false); setErr('Image illisible (format non supporté ?).'); };
    img.src = url;
  };

  const row = (r, i) => {
    const swatch = (
      <input
        type="color"
        aria-label={`Couleur — ${r.hint}`}
        value={r.color}
        onChange={(e) => setRow(i, { color: e.target.value })}
        style={swatchStyle}
      />
    );
    const select = (
      <select
        aria-label={`Biome — ${r.hint}`}
        value={r.biome}
        onChange={(e) => setRow(i, { biome: e.target.value })}
        style={mobile ? { ...selectStyle, flex: 1 } : selectStyle}
      >
        {biomeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    return mobile ? (
      <div key={i} style={{ display: 'grid', gap: 6 }}>
        <span style={hintStyle}>{r.hint}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{swatch}{select}</div>
      </div>
    ) : (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 210px', gap: 10, alignItems: 'center' }}>
        {swatch}
        <span style={hintStyle}>{r.hint}</span>
        {select}
      </div>
    );
  };

  return (
    <div style={{ border: '1px solid rgba(80,50,130,0.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, background: 'rgba(80,50,130,0.06)' }}>
      <span style={blockLabel}>Importer une image (carte Minecraft / satellite)</span>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, lineHeight: 1.6, color: 'rgba(180,170,200,0.7)', margin: '0 0 12px' }}>
        L'image est sous-échantillonnée en <strong>{size}×{size}</strong> cellules :
        la couleur moyenne de chaque cellule est classée en biome via la table
        ci-dessous (modifiable). L'eau est creusée, les montagnes surélevées —
        affine ensuite le relief au pinceau, puis « Enregistrer le dessin ».
        Recadre l'image en carré pour éviter la distorsion. Les marqueurs / POI
        (texte sur l'image) ne sont pas détectés.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 12 : 8 }}>
        {mapping.map(row)}
      </div>

      {err && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: '#ff8898', margin: '12px 0 0' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Analyse…' : '🖼 Choisir une image…'}
        </Button>
        {fileName && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'rgba(180,170,200,0.7)' }}>{fileName}</span>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => { setMapping(DEFAULT_BIOME_MAP.map((r) => ({ ...r }))); setErr(''); }}>
          Réinitialiser la table
        </Button>
      </div>
    </div>
  );
}
