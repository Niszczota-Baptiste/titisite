// Lecture d'un screenshot de coffre Minecraft. La vision (API Claude) ne fait
// QUE repérer la géométrie de la grille + lire les quantités — elle ne nomme pas
// les objets (elle ne connaît pas les textures custom Minefield). Les noms sont
// déterminés par comparaison d'icônes (server/minecraftIconMatch.js).
// Optionnel : actif seulement si ANTHROPIC_API_KEY est configurée. Modèle
// surchargeable via MINECRAFT_VISION_MODEL (défaut : claude-sonnet-4-6).
import Anthropic from '@anthropic-ai/sdk';
import { matchChest } from './minecraftIconMatch.js';

const MODEL = process.env.MINECRAFT_VISION_MODEL || 'claude-sonnet-4-6';

// Sortie structurée : géométrie de la grille + cases pleines (sans nom d'objet).
const FORMAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    grid: {
      type: 'object',
      additionalProperties: false,
      properties: {
        x: { type: 'number' }, y: { type: 'number' },
        w: { type: 'number' }, h: { type: 'number' },
        rows: { type: 'integer' }, cols: { type: 'integer' },
      },
      required: ['x', 'y', 'w', 'h', 'rows', 'cols'],
    },
    slots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          row: { type: 'integer' }, col: { type: 'integer' }, count: { type: 'integer' },
        },
        required: ['row', 'col', 'count'],
      },
    },
  },
  required: ['grid', 'slots'],
};

const PROMPT = `Tu analyses une capture d'écran de l'interface d'un coffre Minecraft (serveur moddé « Minefield »).
Repère la GRILLE du conteneur (les cases d'objets, partie haute de l'écran). IGNORE l'inventaire et la barre d'action du joueur s'ils sont visibles (les 4 rangées du bas, souvent séparées par un espace).
Tu ne dois PAS nommer les objets — uniquement la géométrie et les quantités.

Renvoie en fractions de l'image (valeurs entre 0 et 1) :
- grid.x, grid.y = coin HAUT-GAUCHE de la toute première case (en haut à gauche de la grille du conteneur) ;
- grid.w, grid.h = largeur et hauteur de la zone, jusqu'au coin BAS-DROITE de la dernière case (en bas à droite) ;
- grid.rows, grid.cols = nombre de rangées et de colonnes de cases du conteneur.

Puis, pour CHAQUE case contenant un objet : row et col (indexés à partir de 0 depuis le coin haut-gauche) et count = le petit nombre blanc en bas à droite de l'icône (absence de nombre = 1).

Réponds uniquement via le format structuré demandé.`;

let _client = null;
function client() {
  if (!_client) _client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'env
  return _client;
}

/** Vrai si la lecture par IA est configurée (clé présente). */
export function visionAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function parseGeometry(text) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(text);
  if (!parsed) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed || typeof parsed.grid !== 'object' || !Array.isArray(parsed.slots)) return null;
  return parsed;
}

/**
 * Renvoie [{name, quantity}] : la vision donne la géométrie + les quantités,
 * puis on identifie chaque item par comparaison d'icônes (name = '' si incertain).
 * Peut lever (clé invalide, quota, réseau) — l'appelant renvoie alors une 502.
 */
export async function scanChestScreenshot(buffer, mediaType) {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: FORMAT_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: buffer.toString('base64') } },
        { type: 'text', text: PROMPT },
      ],
    }],
  });
  const text = (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  const geo = parseGeometry(text);
  if (!geo) {
    console.warn(`[minecraft] vision: géométrie illisible (stop=${res.stop_reason}, text="${text.slice(0, 200)}")`);
    return [];
  }
  console.log(`[minecraft] vision: grille ${geo.grid.rows}×${geo.grid.cols}, ${geo.slots.length} cases (stop=${res.stop_reason})`);
  // Noms par comparaison d'icônes (déterministe).
  return matchChest(buffer, geo.grid, geo.slots);
}
