// Lecture d'un screenshot de coffre Minecraft via l'API Claude (vision).
// Optionnel : actif uniquement si ANTHROPIC_API_KEY est configurée — sinon le
// front retombe sur la saisie manuelle (mode hybride). Le modèle est
// surchargeable via MINECRAFT_VISION_MODEL (défaut : claude-opus-4-8).
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.MINECRAFT_VISION_MODEL || 'claude-sonnet-4-6';

// Sortie structurée : garantit un JSON exploitable { items: [{name, quantity}] }.
const FORMAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          quantity: { type: 'integer' },
        },
        required: ['name', 'quantity'],
      },
    },
  },
  required: ['items'],
};

const PROMPT = `Tu analyses une capture d'écran de l'interface d'un coffre Minecraft (serveur moddé « Minefield »).
Identifie chaque emplacement contenant un objet dans la grille du conteneur (la partie HAUTE de l'écran).
Pour chaque objet, lis le petit nombre blanc en bas à droite de l'icône : c'est la taille de la pile (pas de nombre = 1).
Additionne les piles d'un même objet en une seule entrée (quantité totale).
IGNORE l'inventaire et la barre d'action du joueur (les 4 rangées du bas, généralement séparées par un espace).
Donne le nom de chaque objet en FRANÇAIS (ex. « Diamant », « Planches en chêne », « Lingot de fer »). Si un objet est custom/inconnu, donne ta meilleure estimation.
Réponds UNIQUEMENT avec un objet JSON de la forme {"items":[{"name":"Diamant","quantity":64}]}, sans texte autour.`;

let _client = null;
function client() {
  if (!_client) _client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'env
  return _client;
}

/** Vrai si la lecture par IA est configurée (clé présente). */
export function visionAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Extrait un tableau d'items d'un texte de réponse — tente JSON.parse direct,
// puis un repli sur le premier objet {...} trouvé (au cas où le format
// structuré ne serait pas appliqué par la version du SDK/modèle).
function parseItems(text) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(text);
  if (!parsed) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return items
    .map((it) => ({
      name: String(it?.name || '').trim(),
      quantity: Math.max(1, Math.floor(Number(it?.quantity) || 1)),
    }))
    .filter((it) => it.name);
}

/**
 * Envoie l'image à Claude et renvoie [{name, quantity}]. Peut lever (clé
 * invalide, quota, réseau) — l'appelant renvoie alors une 502.
 */
export async function scanChestScreenshot(buffer, mediaType) {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    // Pas de thinking : la lecture d'une grille d'items n'en a pas besoin, et il
    // consommait le budget max_tokens (réponse tronquée → 0 item) tout en
    // augmentant le coût. La sortie structurée garantit le JSON.
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
  const items = parseItems(text);
  // Trace de diagnostic (visible dans `pm2 logs titisite`) : stop_reason +
  // nb d'items, et un extrait de la réponse quand rien n'est extrait.
  if (items.length === 0) {
    console.warn(`[minecraft] vision: 0 item (model=${MODEL}, stop=${res.stop_reason}, text="${text.slice(0, 200)}")`);
  } else {
    console.log(`[minecraft] vision: ${items.length} items (model=${MODEL}, stop=${res.stop_reason})`);
  }
  return items;
}
