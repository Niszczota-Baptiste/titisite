// Génération de la commande /give d'un item custom — fonction PURE.
//
// Le tableur d'origine garde la commande dans une colonne de texte, recopiée à
// la main : elle dérive de la fiche dès qu'un attribut bouge. Ici elle est
// REGÉNÉRÉE depuis les champs, donc toujours d'accord avec eux.
//
// La colonne saisie à la main reste (`mf_items.commande`) : certaines commandes
// du document font des choses qu'aucun formulaire ne modélise (la boussole
// Piaf et son LodestonePos, les couleurs de nom). On ne les interprète pas, on
// les conserve — et la fiche affiche les deux côte à côte.
//
// Format SNBT 1.18 (celui des exemples du document) : Enchantments/lvl,
// AttributeModifiers avec UUID en tableau d'entiers, display.Name en JSON texte.

import { ATTRIBUTS, SLOTS } from './power.js';

const NBT_PAR_ATTR = new Map(ATTRIBUTS.map((a) => [a.cle, a.nbt]));

/**
 * Un composant de texte JSON emballé dans une chaîne SNBT simple-quotée.
 *
 * L'apostrophe est le piège : `Lore:['[{"text":"sous l'eau"}]']` ferme la
 * chaîne au milieu du mot et la commande est refusée — le document d'origine
 * en contient plusieurs, recopiées à la main. On échappe donc l'antislash PUIS
 * l'apostrophe (l'ordre compte : l'inverse ré-échapperait les antislashes
 * qu'on vient d'introduire).
 */
function snbtText(texte) {
  const json = JSON.stringify([{ text: String(texte ?? ''), italic: false }]);
  return `'${json.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * UUID déterministe (4 entiers signés) dérivé d'une graine textuelle. Vanilla
 * exige que deux modificateurs d'un même item aient des UUID différents ; les
 * tirer au hasard ferait changer la commande à chaque affichage, donc à chaque
 * copie — impossible de voir en diff ce qui a réellement bougé.
 */
export function uuidFor(seed) {
  const out = [];
  let h = 2166136261;
  for (let i = 0; i < 4; i += 1) {
    for (const ch of `${seed}#${i}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    out.push(h | 0);
  }
  return out;
}

/** Un nombre tel que le SNBT l'attend : entier nu, décimal sans exposant. */
const nbtNum = (n) => {
  const v = Math.round((Number(n) || 0) * 1e6) / 1e6;
  return Number.isInteger(v) ? String(v) : String(v);
};

/**
 * Construit la commande /give.
 * @param item { nom, description, baseItem, cmd, attributs, enchantements, unbreakable, slug }
 * @param opts { cible } — sélecteur de destination, `@p` par défaut.
 */
export function buildGiveCommand(item, { cible = '@p' } = {}) {
  const base = String(item?.baseItem || '').trim();
  if (!base) return '';
  const id = base.includes(':') ? base : `minecraft:${base}`;
  const tags = [];

  // display : nom + lore. `italic:false` reprend la convention du document —
  // sans lui Minecraft italise tout nom personnalisé.
  const display = [];
  if (item?.nom) display.push(`Name:${snbtText(item.nom)}`);
  const lore = String(item?.description || '')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map(snbtText);
  if (lore.length) display.push(`Lore:[${lore.join(',')}]`);
  if (display.length) tags.push(`display:{${display.join(',')}}`);

  if (Number.isFinite(+item?.cmd) && +item.cmd > 0) tags.push(`CustomModelData:${Math.trunc(+item.cmd)}`);

  const enchants = (item?.enchantements || [])
    .filter((e) => e?.enchant)
    .map((e) => `{id:"minecraft:${e.enchant}",lvl:${Math.trunc(Number(e.niveau) || 1)}}`);
  if (enchants.length) tags.push(`Enchantments:[${enchants.join(',')}]`);

  const mods = (item?.attributs || [])
    .filter((a) => NBT_PAR_ATTR.has(a?.attribut))
    .map((a, i) => {
      const parts = [`AttributeName:"${NBT_PAR_ATTR.get(a.attribut)}"`];
      // Un pourcentage est l'opération 1 (multiply_base) et s'exprime en
      // fraction : « −15 % » s'écrit Amount:-0.15,Operation:1.
      const pourcent = a.mode === 'pourcent';
      parts.push(`Amount:${nbtNum(pourcent ? (Number(a.valeur) || 0) / 100 : a.valeur)}`);
      if (pourcent) parts.push('Operation:1');
      const slot = SLOTS.includes(a.slot) ? a.slot : 'any';
      if (slot !== 'any') parts.push(`Slot:"${slot}"`);
      parts.push(`UUID:[I;${uuidFor(`${item?.slug || item?.nom || base}:${a.attribut}:${i}`).join(',')}]`);
      parts.push(`Name:"${a.attribut}"`);
      return `{${parts.join(',')}}`;
    });
  if (mods.length) tags.push(`AttributeModifiers:[${mods.join(',')}]`);

  if (item?.unbreakable) tags.push('Unbreakable:1');

  return `give ${cible} ${id}${tags.length ? `{${tags.join(',')}}` : ''} 1`;
}
