// Codex des BLOCS pour les builds importés : fusionne le vanilla
// (src/data/codex_vanilla.json, ns:"minecraft", import() dynamique → chunk à
// part) et le custom Minefield (public/codex/codex.json, fetch runtime). Clé =
// « ns:id » pour matcher directement les Name de palette d'un .mca
// (« minecraft:oak_stairs », « minefield:… »). Les variantes d'état sont déjà
// regroupées : un Name de palette ne porte pas les Properties.

let _promise = null;

const vanillaIcon = (icon) => (icon ? `/codex/vanilla-icons/${icon.replace(/^icons\//, '')}` : null);
const minefieldIcon = (icon) => (icon ? `/codex/${icon}` : null);

export function loadBlockCodex() {
  if (!_promise) {
    _promise = Promise.all([
      import('./codex_vanilla.json').then((m) => m.default || m).catch(() => []),
      fetch('/codex/codex.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([vanilla, minefield]) => {
      const map = new Map();
      for (const e of vanilla) {
        const key = `minecraft:${e.id}`;
        map.set(key, { key, ns: 'minecraft', id: e.id, nomFr: e.nomFr || e.id, icon: vanillaIcon(e.icon) });
      }
      for (const e of minefield) {
        const key = `minefield:${e.id}`;
        map.set(key, { key, ns: 'minefield', id: e.id, nomFr: e.nomFr || e.id, icon: minefieldIcon(e.icon), categorie: e.categorie });
      }
      return map;
    });
  }
  return _promise;
}

// Normalise un blockId (« oak_planks » → « minecraft:oak_planks ») et renvoie
// l'entrée du codex, avec un repli lisible si le bloc est inconnu.
export function resolveBlock(map, blockId) {
  const key = blockId.includes(':') ? blockId : `minecraft:${blockId}`;
  const hit = map?.get(key);
  if (hit) return hit;
  const [ns, ...rest] = key.split(':');
  return { key, ns, id: rest.join(':'), nomFr: rest.join(':'), icon: null };
}
