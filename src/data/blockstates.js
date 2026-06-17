// Résolution d'état de bloc → modèle(s) + rotation, à partir de blockstates.json
// (servi depuis public/codex/, fetch runtime — 5 Mo, hors bundle JS). Gère les
// `variants` (clé "prop=val,…") et le `multipart` (parts dont `when` est
// satisfait). Les modèles résolus vivent dans public/codex/render-models/
// (« block_<nom>.json »), textures dans render-textures/.

export const RENDER_TEXTURE_BASE = '/codex/render-textures/';
export const RENDER_TEXTURE_URL = (file) => RENDER_TEXTURE_BASE + file;

let _states = null;
const _models = new Map(); // ref -> Promise<model|null>

export function loadBlockstates() {
  if (!_states) {
    _states = fetch('/codex/blockstates.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return _states;
}

// "minecraft:block/oak_stairs" / "minefield:block/x" / "…:x" → block_x.json
function refToFile(ref) {
  const seg = String(ref).replace(/^[^:]+:/, '').replace(/^block\//, '');
  return `block_${seg}.json`;
}

export function loadRenderModel(ref) {
  if (!ref) return Promise.resolve(null);
  if (_models.has(ref)) return _models.get(ref);
  const p = fetch(`/codex/render-models/${refToFile(ref)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  _models.set(ref, p);
  return p;
}

// apply peut être un objet OU un tableau (variantes aléatoires) → on prend la 1re.
const firstApply = (a) => (Array.isArray(a) ? a[0] : a);

// Évalue une condition `when` de multipart contre les props du bloc.
function evalWhen(when, props) {
  if (!when) return true;
  if (when.OR) return when.OR.some((w) => evalWhen(w, props));
  if (when.AND) return when.AND.every((w) => evalWhen(w, props));
  return Object.entries(when).every(([k, v]) => {
    const pv = props?.[k];
    if (pv === undefined) return false; // prop absente → connexion non rendue
    return String(v).split('|').includes(pv);
  });
}

// Choisit le meilleur variant : aucune condition contredite, puis le plus de
// conditions satisfaites (le plus spécifique). Les props présentes dans la clé
// mais absentes du bloc (ex. « vertical » des packs custom) sont neutres.
function pickVariant(variants, props) {
  let best = null;
  let bestScore = -1;
  let bestSpec = -1;
  for (const [key, value] of Object.entries(variants)) {
    const conds = key === '' ? [] : key.split(',').map((c) => c.split('='));
    let satisfied = 0;
    let contradicted = false;
    for (const [k, v] of conds) {
      const pv = props?.[k];
      if (pv === undefined) continue;
      if (pv === v) satisfied++;
      else { contradicted = true; break; }
    }
    if (contradicted) continue;
    if (satisfied > bestScore || (satisfied === bestScore && conds.length > bestSpec)) {
      best = value; bestScore = satisfied; bestSpec = conds.length;
    }
  }
  return best;
}

/**
 * Résout un (name, props) en une liste de { model, x, y, uvlock } à rendre.
 * Renvoie null si le bloc n'est pas dans blockstates (→ repli appelant).
 */
export function resolveBlockstate(states, name, props) {
  const bs = states?.[name];
  if (!bs) return null;
  if (bs.type === 'multipart' || Array.isArray(bs.multipart)) {
    const out = [];
    for (const part of bs.multipart || []) {
      if (evalWhen(part.when, props)) {
        const a = firstApply(part.apply);
        if (a?.model) out.push({ model: a.model, x: a.x || 0, y: a.y || 0, uvlock: !!a.uvlock });
      }
    }
    return out.length ? out : null;
  }
  const variants = bs.variants || {};
  const chosen = firstApply(pickVariant(variants, props));
  if (!chosen?.model) return null;
  return [{ model: chosen.model, x: chosen.x || 0, y: chosen.y || 0, uvlock: !!chosen.uvlock }];
}
