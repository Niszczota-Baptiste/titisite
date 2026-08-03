// Auth state lives in an HttpOnly cookie set by the server. The client only
// keeps a *display* copy of the user (name/email/role) in localStorage so the
// UI can render before /auth/me responds — the cookie is the source of truth.

const USER_KEY = 'portfolio_current_user';

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* ignore quota */ }
}

export function clearSession() {
  setStoredUser(null);
}

// Fire-and-forget analytics event. Never throws — a blocked beacon (ad-blocker,
// offline) must not break the click it's attached to.
export function trackEvent(name, label) {
  try { api.analytics.event(name, label).catch(() => {}); } catch { /* ignore */ }
}

// Beacon a JSON body even during page unload — uses navigator.sendBeacon when
// available (works through pagehide / tab close), falls back to fetch with
// keepalive. Never throws.
export function sendBeaconJSON(url, body) {
  try {
    const json = JSON.stringify(body);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: json,
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Fire-and-forget link-click beacon. `to` may be a path ('/foo') or an
// absolute URL ('https://example.com'). `kind` is one of the allowlist
// enforced server-side.
export function trackClick(to, kind) {
  try {
    sendBeaconJSON('/api/analytics/click', {
      from: typeof window !== 'undefined' ? window.location.pathname : '/',
      to,
      kind,
    });
  } catch { /* ignore */ }
}

// { a: 1, b: undefined } → '?a=1' ('' si rien à encoder). Les valeurs null /
// undefined / '' sont omises pour ne pas polluer les URLs.
function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function uploadFile(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.withCredentials = true;
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error(data?.error || `HTTP ${xhr.status}`);
        err.status = xhr.status;
        err.body = data;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('network_error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(formData);
  });
}

// POST JSON et renvoie la réponse binaire (Blob) — pour les exports image.
async function fetchBlob(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return res.blob();
}

// POST multipart (FormData + champs) et renvoie la réponse binaire (Blob).
async function uploadBlob(path, fields, file) {
  const fd = new FormData();
  if (file) fd.append('image', file);
  for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
  const res = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return res.blob();
}

export async function triggerDownload(url, suggestedName) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('download_failed');
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = suggestedName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export const api = {
  get:  (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put:  (path, body) => request('PUT', path, body),
  del:  (path) => request('DELETE', path),

  login: async (email, password) => {
    const out = await request('POST', '/auth/login', { email, password });
    if (out?.user) setStoredUser(out.user);
    return out;
  },
  logout: async () => {
    try { await request('POST', '/auth/logout'); } catch { /* ignore */ }
    clearSession();
  },
  me: () => request('GET', '/auth/me'),

  // iCal feed (per-user token, used to subscribe from phone/desktop calendars)
  icalToken:       () => request('GET',  '/me/ical-token'),
  rotateIcalToken: () => request('POST', '/me/ical-token/rotate'),

  // Self-service password change. The admin route refuses to touch admin
  // accounts so this is the only way to rotate one's own password.
  changeMyPassword: (currentPassword, newPassword) =>
    request('PUT', '/me/password', { currentPassword, newPassword }),

  // Email digest opt-in (off / daily / weekly).
  digestPrefs:    () => request('GET', '/me/digest-prefs'),
  setDigestPrefs: (frequency) => request('PUT', '/me/digest-prefs', { frequency }),

  // Site settings (public-page section order/visibility)
  publicSections:    () => request('GET', '/settings/public-sections'),
  setPublicSections: (sections) => request('PUT', '/settings/public-sections', { sections }),

  // Analytics — `hit` is a fire-and-forget public beacon (callers swallow
  // errors), `summary` is the admin dashboard aggregate.
  analytics: {
    hit:     (path, referrer) => request('POST', '/analytics/hit', { path, referrer }),
    event:   (name, label) => request('POST', '/analytics/event', { name, label }),
    summary: (days) => request('GET', `/analytics/summary${days ? `?days=${days}` : ''}`),
    writingSummary: (days) => request('GET', `/analytics/summary/writing${days ? `?days=${days}` : ''}`),
  },

  // Contact form: public send + admin inbox.
  contact: {
    send:     (body) => request('POST', '/contact', body),
    list:     () => request('GET', '/contact'),
    markRead: (id, read = true) => request('PATCH', `/contact/${id}/read`, { read }),
    remove:   (id) => request('DELETE', `/contact/${id}`),
  },

  // Public-site collections (admin-only writes)
  list:    (c) => request('GET', `/${c}`),
  create:  (c, body) => request('POST', `/${c}`, body),
  update:  (c, id, body) => request('PUT', `/${c}/${id}`, body),
  remove:  (c, id) => request('DELETE', `/${c}/${id}`),
  reorder: (c, order) => request('POST', `/${c}/reorder`, { order }),

  // Users
  users:      () => request('GET', '/users'),
  createUser: (body) => request('POST', '/users', body),
  updateUser: (id, body) => request('PUT', `/users/${id}`, body),
  deleteUser: (id) => request('DELETE', `/users/${id}`),

  // Stairs (private shared catalogue, gated by users.can_view_stairs)
  stairs: {
    list:      () => request('GET',    '/stairs'),
    create:    (body) => request('POST',   '/stairs', body),
    update:    (id, body) => request('PUT',    `/stairs/${id}`, body),
    remove:    (id) => request('DELETE', `/stairs/${id}`),
    regeocode: (id) => request('POST',   `/stairs/${id}/regeocode`),
  },

  // Build importé partagé en lecture seule (public, par token).
  // Accès WorldEdit par lien de partage scopé (view/edit) — pas de cookie.
  worldeditShared: (token) => {
    const root = `/worldedit/shared/${token}`;
    return {
      state:      () => request('GET',  `${root}/state`),
      operations: () => request('GET',  `${root}/operations`),
      dataUrl:    () => `/api${root}/data`,
      previewUrl: () => `/api${root}/preview`,
      exportUrl:  () => `/api${root}/export`,
      transform:  (b) => request('POST', `${root}/transform`, b),
      transformAsync: (b) => request('POST', `${root}/transform`, { ...b, async: true }),
      job:        (jobId) => request('GET', `${root}/jobs/${jobId}`),
      undo:       () => request('POST', `${root}/undo`),
      redo:       () => request('POST', `${root}/redo`),
      floodSelect: (b) => request('POST', `${root}/select-flood`, b),
      heightmap:  (file, fields) => {
        const fd = new FormData();
        fd.append('image', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
        return uploadFile(`${root}/heightmap`, fd);
      },
      exportHeightmap: (selection) => fetchBlob(`${root}/heightmap-export`, { selection }),
      panel:      (fields, file) => {
        const fd = new FormData();
        if (file) fd.append('image', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
        return uploadFile(`${root}/panel`, fd);
      },
      mapart:     (fields, file) => uploadBlob(`${root}/mapart`, fields, file),
      mapBlocks:  (fields, file) => {
        const fd = new FormData();
        if (file) fd.append('image', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
        return uploadFile(`${root}/mapblocks`, fd);
      },
      renderPreview: (fields, file) => uploadBlob(`${root}/render-preview`, fields, file),
      reset:      () => request('POST', `${root}/reset`),
      audit:      () => request('GET',  `${root}/audit`),
      schematics:    () => request('GET',  `${root}/schematics`),
      saveSchematic: (b) => request('POST', `${root}/schematics/save`, b),
      loadSchematic: (sid) => request('POST', `${root}/schematics/${sid}/load`),
      deleteSchematic: (sid) => request('DELETE', `${root}/schematics/${sid}`),
      schematicExportUrl: (sid, fmt) => `/api${root}/schematics/${sid}/export?format=${fmt || 'schem'}`,
      importSchematic: (file, fields) => {
        const fd = new FormData();
        fd.append('file', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
        return uploadFile(`${root}/schematics/import`, fd);
      },
    };
  },
  blueprintShared: {
    get:     (token) => request('GET', `/blueprints/shared/${token}`),
    dataUrl: (token) => `/api/blueprints/shared/${token}/data`,
  },

  // Custom Minecraft recipes (global; read for any auth user, write admin-only).
  recipes: {
    list:   () => request('GET',    '/recipes'),
    create: (b) => request('POST',  '/recipes', b),
    update: (id, b) => request('PUT', `/recipes/${id}`, b),
    remove: (id) => request('DELETE', `/recipes/${id}`),
  },

  // Craft Minefield (vraies recettes du serveur, confidentielles côté back) :
  // recherche paginée, recette(s) d'un item, plan développé CÔTÉ SERVEUR
  // (croisé avec les coffres du workspace passé en body). Auth requise.
  craft: {
    recipes: (params = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, v);
      }
      const s = q.toString();
      return request('GET', `/craft/recipes${s ? `?${s}` : ''}`);
    },
    recipe: (itemId) => request('GET', `/craft/recipe/${encodeURIComponent(itemId)}`),
    plan:   (b) => request('POST', '/craft/plan', b),
  },

  // Quest tracker (« Quêtes » — Nostra / Minefield). Global module: read gated
  // by canViewQuests, edit by canEditQuests. Completion is per-member.
  quests: {
    factions:   () => request('GET', '/quests/factions'),
    chains:     () => request('GET', '/quests/chains'),
    groups:     () => request('GET', '/quests/groups'),
    chainGraph: (id) => request('GET', `/quests/chains/${id}/graph`),
    gains:      (groupId) => request('GET', `/quests/gains${groupId ? `?group=${groupId}` : ''}`),
    // Groupes privés (sélections perso pour la projection de gains).
    myGroups: {
      create:    (b) => request('POST', '/quests/my-groups', b),
      update:    (id, b) => request('PUT', `/quests/my-groups/${id}`, b),
      remove:    (id) => request('DELETE', `/quests/my-groups/${id}`),
      questIds:  (id) => request('GET', `/quests/my-groups/${id}/quests`),
      setQuests: (id, questIds) => request('PUT', `/quests/my-groups/${id}/quests`, { questIds }),
    },
    reputation: () => request('GET', '/quests/reputation'),
    maps:       () => request('GET', '/quests/maps'),
    map:        (mapId) => request('GET', `/quests/map${mapId ? `?map=${mapId}` : ''}`),
    // Items custom : objets du codex renommés (+ enchantements), référencés
    // dans les lignes de quêtes via refCode 'custom:<id>'.
    customItems:      () => request('GET', '/quests/custom-items'),
    // Catalogue d'items uniques — MÊME entité que les items custom, vue riche
    // (rareté, lore, catégorie, prix, table de butin, sources).
    uniqueItems: {
      list:     () => request('GET', '/quests/unique-items'),
      get:      (id) => request('GET', `/quests/unique-items/${id}`),
      // Index inversé : { sources: {…}, usages: {…} }, entièrement dérivé.
      sources:  (id) => request('GET', `/quests/unique-items/${id}/sources`),
      create:   (b) => request('POST', '/quests/unique-items', b),
      update:   (id, b) => request('PUT', `/quests/unique-items/${id}`, b),
      remove:   (id) => request('DELETE', `/quests/unique-items/${id}`),
      // Journal d'ouvertures : ouvert à tout lecteur de quêtes (taux empiriques).
      observations:    (id) => request('GET', `/quests/unique-items/${id}/observations`),
      logObservation:  (id, b) => request('POST', `/quests/unique-items/${id}/observations`, b),
      deleteObservation: (obsId) => request('DELETE', `/quests/observations/${obsId}`),
    },
    // Échelle de rareté (table éditable, pas un enum).
    rarities: {
      list:    () => request('GET', '/quests/rarities'),
      create:  (b) => request('POST', '/quests/rarities', b),
      update:  (id, b) => request('PUT', `/quests/rarities/${id}`, b),
      reorder: (ids) => request('PUT', '/quests/rarities', { ids }),
      remove:  (id) => request('DELETE', `/quests/rarities/${id}`),
    },
    list:       (params = {}) => {
      const q = new URLSearchParams();
      if (params.faction) q.set('faction', params.faction);
      if (params.chain) q.set('chain', params.chain);
      if (params.group) q.set('group', params.group);
      if (params.occurrence) q.set('occurrence', params.occurrence);
      if (params.categorie) q.set('categorie', params.categorie);
      const s = q.toString();
      return request('GET', `/quests/quests${s ? `?${s}` : ''}`);
    },
    get:        (id) => request('GET', `/quests/quests/${id}`),
    // Où trouver les entrées `item` d'une quête dans les coffres des projets.
    stock:      (id) => request('GET', `/quests/quests/${id}/stock`),
    mine:       () => request('GET', '/quests/me/quests'),
    complete:   (id) => request('POST', `/quests/quests/${id}/complete`),
    uncomplete: (id) => request('POST', `/quests/quests/${id}/uncomplete`),
    // Édition (canEditQuests) — factions, chaînes, quêtes (payload imbriqué).
    createFaction: (b) => request('POST', '/quests/factions', b),
    updateFaction: (id, b) => request('PUT', `/quests/factions/${id}`, b),
    deleteFaction: (id) => request('DELETE', `/quests/factions/${id}`),
    createChain:   (b) => request('POST', '/quests/chains', b),
    updateChain:   (id, b) => request('PUT', `/quests/chains/${id}`, b),
    deleteChain:   (id) => request('DELETE', `/quests/chains/${id}`),
    createGroup:   (b) => request('POST', '/quests/groups', b),
    updateGroup:   (id, b) => request('PUT', `/quests/groups/${id}`, b),
    deleteGroup:   (id) => request('DELETE', `/quests/groups/${id}`),
    createPoi:     (b) => request('POST', '/quests/pois', b),
    updatePoi:     (id, b) => request('PUT', `/quests/pois/${id}`, b),
    deletePoi:     (id) => request('DELETE', `/quests/pois/${id}`),
    createMap:     (b) => request('POST', '/quests/maps', b),
    updateMap:     (id, b) => request('PUT', `/quests/maps/${id}`, b),
    deleteMap:     (id) => request('DELETE', `/quests/maps/${id}`),
    createQuest:   (b) => request('POST', '/quests/quests', b),
    updateQuest:   (id, b) => request('PUT', `/quests/quests/${id}`, b),
    deleteQuest:   (id) => request('DELETE', `/quests/quests/${id}`),
    createCustomItem: (b) => request('POST', '/quests/custom-items', b),
    updateCustomItem: (id, b) => request('PUT', `/quests/custom-items/${id}`, b),
    deleteCustomItem: (id) => request('DELETE', `/quests/custom-items/${id}`),
  },

  // Cockpit MF pull feed: secret per-user token + reminder opt-in.
  cockpitInfo:       () => request('GET',  '/me/cockpit-token'),
  rotateCockpit:     () => request('POST', '/me/cockpit-token/rotate'),
  setQuestReminders: (enabled) => request('PUT', '/me/quest-reminders', { enabled }),

  // Réglages perso du cockpit (page admin « Cockpit ») : items envoyés dans la
  // section `wanted` du flux + quêtes suivies (filtre available/deadlines).
  cockpit: {
    items: {
      list:       () => request('GET',    '/me/cockpit/items'),
      create:     (b) => request('POST',  '/me/cockpit/items', b),
      update:     (id, b) => request('PUT', `/me/cockpit/items/${id}`, b),
      toggleDone: (id) => request('PATCH', `/me/cockpit/items/${id}/done`),
      remove:     (id) => request('DELETE', `/me/cockpit/items/${id}`),
    },
    quests: () => request('GET', '/me/cockpit/quests'),
    setFollow: (id, followed) => request('PUT', `/me/cockpit/quests/${id}/follow`, { followed }),
  },

  // Atelier « Salle des coffres » : plans de rangement Minefield. Module global
  // gated par canViewVault ; un plan appartient à un compte et se partage
  // explicitement. Le module ne manipule jamais de ressource ni de quantité.
  vault: {
    list:   () => request('GET', '/vault-plans'),
    get:    (id) => request('GET', `/vault-plans/${id}`),
    create: (b) => request('POST', '/vault-plans', b),
    // `plan` porte le document complet + la révision attendue. Rejette une
    // erreur `status === 409` (corps : { updatedBy, updatedAt, serverRevision })
    // quand le plan a bougé côté serveur — voir la modale de conflit.
    save:   (id, plan) => request('PUT', `/vault-plans/${id}`, plan),
    // « Écraser » depuis la modale de conflit : saute la vérification de révision.
    overwrite: (id, plan) => request('PUT', `/vault-plans/${id}`, { ...plan, force: true }),
    remove: (id) => request('DELETE', `/vault-plans/${id}`),
    share:   (id, userId) => request('POST', `/vault-plans/${id}/share`, { userId }),
    unshare: (id, userId) => request('DELETE', `/vault-plans/${id}/share/${userId}`),
    snapshots: {
      list:    (id) => request('GET',  `/vault-plans/${id}/snapshots`),
      create:  (id, label) => request('POST', `/vault-plans/${id}/snapshots`, { label }),
      restore: (id, sid) => request('POST', `/vault-plans/${id}/snapshots/${sid}/restore`),
    },
    categories: {
      list:   () => request('GET', '/vault-categories'),
      create: (b) => request('POST', '/vault-categories', b),
      update: (id, b) => request('PUT', `/vault-categories/${id}`, b),
      remove: (id) => request('DELETE', `/vault-categories/${id}`),
    },
  },

  // Lore « Nostra » : enquête collaborative sur le lore de la map Minefield.
  // Module global gated par canViewLore — tout est privé, médias compris
  // (`media[].url` pointe vers /api/lore/media/file/*, servi derrière le gate).
  lore: {
    entries: {
      list:      (params) => request('GET', `/lore/entries${qs(params)}`),
      get:       (idOrSlug) => request('GET', `/lore/entries/${idOrSlug}`),
      create:    (b) => request('POST', '/lore/entries', b),
      update:    (id, b) => request('PUT', `/lore/entries/${id}`, b),
      remove:    (id) => request('DELETE', `/lore/entries/${id}`),
      revisions: (id) => request('GET', `/lore/entries/${id}/revisions`),
    },
    hypotheses: {
      list:      (params) => request('GET', `/lore/hypotheses${qs(params)}`),
      get:       (id) => request('GET', `/lore/hypotheses/${id}`),
      create:    (b) => request('POST', '/lore/hypotheses', b),
      update:    (id, b) => request('PUT', `/lore/hypotheses/${id}`, b),
      remove:    (id) => request('DELETE', `/lore/hypotheses/${id}`),
      revisions: (id) => request('GET', `/lore/hypotheses/${id}/revisions`),
      addEvidence: (id, b) => request('POST', `/lore/hypotheses/${id}/evidence`, b),
    },
    evidence: {
      update: (id, b) => request('PUT', `/lore/evidence/${id}`, b),
      remove: (id) => request('DELETE', `/lore/evidence/${id}`),
    },
    tags: {
      list:   () => request('GET', '/lore/tags'),
      create: (b) => request('POST', '/lore/tags', b),
      update: (id, b) => request('PUT', `/lore/tags/${id}`, b),
      remove: (id) => request('DELETE', `/lore/tags/${id}`),
    },
    links: {
      create: (b) => request('POST', '/lore/links', b),
      remove: (id) => request('DELETE', `/lore/links/${id}`),
    },
    maps: {
      list:   () => request('GET', '/lore/maps'),
      create: (b) => request('POST', '/lore/maps', b),
      update: (id, b) => request('PUT', `/lore/maps/${id}`, b),
      remove: (id) => request('DELETE', `/lore/maps/${id}`),
      // FormData { image } — fond de carte, remplace l'image précédente.
      setImage: (id, formData, opts) => uploadFile(`/lore/maps/${id}/image`, formData, opts),
    },
    // Tuiles 128×128 : la grille des cartes Minecraft. FormData
    // { image, tileX, tileZ } ; ré-uploader une tuile remplace son image.
    tiles: {
      list:   (mapId) => request('GET', `/lore/maps/${mapId}/tiles`),
      upload: (mapId, formData, opts) => uploadFile(`/lore/maps/${mapId}/tiles`, formData, opts),
      remove: (id) => request('DELETE', `/lore/tiles/${id}`),
    },
    // Tracés d'enquête : lignes/polygones reliant des points de la carte.
    shapes: {
      list:   (params) => request('GET', `/lore/shapes${qs(params)}`),
      create: (b) => request('POST', '/lore/shapes', b),
      update: (id, b) => request('PUT', `/lore/shapes/${id}`, b),
      remove: (id) => request('DELETE', `/lore/shapes/${id}`),
    },
    // Peuples + dialogues des PNJ (un PNJ = une entrée de type `pnj`).
    peuples: {
      list:   () => request('GET', '/lore/peuples'),
      create: (b) => request('POST', '/lore/peuples', b),
      update: (id, b) => request('PUT', `/lore/peuples/${id}`, b),
      remove: (id) => request('DELETE', `/lore/peuples/${id}`),
    },
    dialogues: {
      add:    (entryId, b) => request('POST', `/lore/entries/${entryId}/dialogues`, b),
      update: (id, b) => request('PUT', `/lore/dialogues/${id}`, b),
      remove: (id) => request('DELETE', `/lore/dialogues/${id}`),
    },
    media: {
      // FormData { image, entryId? | hypothesisId?, caption? }
      upload:     (formData, opts) => uploadFile('/lore/media', formData, opts),
      setCaption: (id, caption) => request('PUT', `/lore/media/${id}`, { caption }),
      remove:     (id) => request('DELETE', `/lore/media/${id}`),
    },
    mapPoints: (params) => request('GET', `/lore/map/points${qs(params)}`),
    bearing:   (from, to) => request('POST', '/lore/geo/bearing', { from, to }),
    ring:      (originX, originZ, params) => request('GET',
      `/lore/geo/ring${qs({ origin_x: originX, origin_z: originZ, ...params })}`),
    search:    (q) => request('GET', `/lore/search${qs({ q })}`),
    graph:     () => request('GET', '/lore/graph'),
    export:    () => request('GET', '/lore/export'),
  },

  // Cross-project Minecraft admin (all workspaces' chests/resources) + shops.
  minecraftAdmin: {
    overview:    () => request('GET', '/minecraft-admin/overview'),
    adjustItem:  (id, b) => request('POST', `/minecraft-admin/resources/${id}/adjust`, b),
    shops: {
      list:   () => request('GET',    '/minecraft-admin/shops'),
      create: (b) => request('POST',  '/minecraft-admin/shops', b),
      update: (id, b) => request('PUT', `/minecraft-admin/shops/${id}`, b),
      remove: (id) => request('DELETE', `/minecraft-admin/shops/${id}`),
      items: {
        create: (shopId, b) => request('POST', `/minecraft-admin/shops/${shopId}/items`, b),
        update: (id, b) => request('PUT', `/minecraft-admin/shop-items/${id}`, b),
        remove: (id) => request('DELETE', `/minecraft-admin/shop-items/${id}`),
      },
    },
  },

  // Workspaces (team projects)
  workspaces: {
    list:       () => request('GET', '/workspaces'),
    get:        (slug) => request('GET', `/workspaces/${slug}`),
    create:     (body) => request('POST', '/workspaces', body),
    update:     (id, body) => request('PUT', `/workspaces/${id}`, body),
    remove:     (id) => request('DELETE', `/workspaces/${id}`),
    setMembers: (id, memberIds) => request('PUT', `/workspaces/${id}/members`, { memberIds }),
  },

  // Scoped per-workspace resources
  ws: (slug) => ({
    base: `/workspaces/${slug}`,
    features: {
      list:   () => request('GET', `/workspaces/${slug}/features`),
      create: (b) => request('POST', `/workspaces/${slug}/features`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/features/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/features/${id}`),
    },
    meetings: {
      list:   () => request('GET', `/workspaces/${slug}/meetings`),
      create: (b) => request('POST', `/workspaces/${slug}/meetings`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/meetings/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/meetings/${id}`),
    },
    documents: {
      list:   () => request('GET', `/workspaces/${slug}/documents`),
      update: (id, b) => request('PUT', `/workspaces/${slug}/documents/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/documents/${id}`),
      uploadPath: `/workspaces/${slug}/documents`,
      downloadUrl: (id) => `/api/workspaces/${slug}/documents/${id}/download`,
    },
    builds: {
      list:   () => request('GET', `/workspaces/${slug}/builds`),
      create: (b) => request('POST', `/workspaces/${slug}/builds`, b),
      update: (id, b) => request('PUT', `/workspaces/${slug}/builds/${id}`, b),
      remove: (id) => request('DELETE', `/workspaces/${slug}/builds/${id}`),
      uploadPath: `/workspaces/${slug}/builds`,
      downloadUrl: (id) => `/api/workspaces/${slug}/builds/${id}/download`,
    },
    minecraft: {
      list:         () => request('GET',    `/workspaces/${slug}/minecraft`),
      create:       (b) => request('POST',  `/workspaces/${slug}/minecraft`, b),
      update:       (id, b) => request('PUT', `/workspaces/${slug}/minecraft/${id}`, b),
      adjust:       (id, delta) => request('POST', `/workspaces/${slug}/minecraft/${id}/adjust`, { delta }),
      toggleFav:    (id) => request('PATCH', `/workspaces/${slug}/minecraft/${id}/favorite`),
      remove:       (id) => request('DELETE', `/workspaces/${slug}/minecraft/${id}`),
      craftApply:   (b) => request('POST', `/workspaces/${slug}/minecraft/craft/apply`, b),
      // Ressources recherchées (wanted) : wishlist triée par priorité.
      wanted: {
        list:       () => request('GET',    `/workspaces/${slug}/minecraft/wanted`),
        create:     (b) => request('POST',  `/workspaces/${slug}/minecraft/wanted`, b),
        // Ajout en masse (manquant du calculateur / BOM) : fusion par nom normalisé.
        bulk:       (b) => request('POST',  `/workspaces/${slug}/minecraft/wanted/bulk`, b),
        update:     (id, b) => request('PUT', `/workspaces/${slug}/minecraft/wanted/${id}`, b),
        toggleDone: (id) => request('PATCH', `/workspaces/${slug}/minecraft/wanted/${id}/done`),
        remove:     (id) => request('DELETE', `/workspaces/${slug}/minecraft/wanted/${id}`),
      },
      // Historique du stock (un point par nom normalisé et par jour).
      history: (days = 30) => request('GET', `/workspaces/${slug}/minecraft/history?days=${days}`),
      // Équipement nommé (« stuff » : outils renommés + enchants + rangement).
      gear: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/gear`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/gear`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/gear/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/gear/${id}`),
      },
      // Villageois (métier, coords, trades avec prix réduit par joueur).
      villagers: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/villagers`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/villagers`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/villagers/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/villagers/${id}`),
        trades: {
          create: (vid, b) => request('POST', `/workspaces/${slug}/minecraft/villagers/${vid}/trades`, b),
          update: (vid, id, b) => request('PUT', `/workspaces/${slug}/minecraft/villagers/${vid}/trades/${id}`, b),
          remove: (vid, id) => request('DELETE', `/workspaces/${slug}/minecraft/villagers/${vid}/trades/${id}`),
        },
      },
      // POI de la carte du projet (bases, portails, fermes…).
      mapPois: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/map-pois`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/map-pois`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/map-pois/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/map-pois/${id}`),
      },
      // Cartes nommées du projet (vue + image de fond calibrée, comme les quêtes).
      maps: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/maps`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/maps`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/maps/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/maps/${id}`),
      },
      // Schémas / croquis (dessin libre sur capture ou feuille blanche).
      sketches: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/sketches`),
        get:    (id) => request('GET',  `/workspaces/${slug}/minecraft/sketches/${id}`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/sketches`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/sketches/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/sketches/${id}`),
      },
      // Fils de discussion / RP du projet (commentaires via api.comments 'thread').
      threads: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/threads`),
        get:    (id) => request('GET',  `/workspaces/${slug}/minecraft/threads/${id}`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/threads`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/threads/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/threads/${id}`),
      },
      // Upload d'image scopé membre (fond de carte, capture de schéma).
      uploadImage: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        return uploadFile(`/workspaces/${slug}/minecraft/upload-image`, fd);
      },
      // Coffres (containers) + flux screenshot → items.
      chests: {
        list:   () => request('GET',    `/workspaces/${slug}/minecraft/chests`),
        create: (b) => request('POST',  `/workspaces/${slug}/minecraft/chests`, b),
        update: (id, b) => request('PUT', `/workspaces/${slug}/minecraft/chests/${id}`, b),
        remove: (id) => request('DELETE', `/workspaces/${slug}/minecraft/chests/${id}`),
        apply:  (id, b) => request('POST', `/workspaces/${slug}/minecraft/chests/${id}/apply`, b),
      },
      scanScreenshot: (file) => {
        const fd = new FormData();
        fd.append('image', file);
        return uploadFile(`/workspaces/${slug}/minecraft/scan-screenshot`, fd);
      },
    },
    // Builds importés (.mca) : upload+parse, méta+BOM, données sparse, partage.
    blueprints: {
      list:   () => request('GET',    `/workspaces/${slug}/blueprints`),
      get:    (id) => request('GET',  `/workspaces/${slug}/blueprints/${id}`),
      dataUrl: (id) => `/api/workspaces/${slug}/blueprints/${id}/data`,
      remove: (id) => request('DELETE', `/workspaces/${slug}/blueprints/${id}`),
      duplicate: (id, b) => request('POST', `/workspaces/${slug}/blueprints/${id}/duplicate`, b),
      extract:   (id, b) => request('POST', `/workspaces/${slug}/blueprints/${id}/extract`, b),
      createBlank: (b) => request('POST', `/workspaces/${slug}/blueprints/blank`, b),
      share:    (id) => request('POST', `/workspaces/${slug}/blueprints/${id}/share`),
      unshare:  (id) => request('DELETE', `/workspaces/${slug}/blueprints/${id}/share`),
      upload: (file, fields, onProgress) => {
        const fd = new FormData();
        fd.append('file', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
        return uploadFile(`/workspaces/${slug}/blueprints`, fd, { onProgress });
      },
      // Screenshot → nouvelle carte en blocs (map-art) : image + taille de grille
      // (cols/rows) + orientation → build plat créé, visible dans le générateur 3D.
      fromImage: (file, fields, onProgress) => {
        const fd = new FormData();
        fd.append('image', file);
        for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
        return uploadFile(`/workspaces/${slug}/blueprints/mapart`, fd, { onProgress });
      },
      // Liens de partage scopés (view/edit) — gestion réservée au propriétaire.
      shares: {
        list:   (id) => request('GET',    `/workspaces/${slug}/blueprints/${id}/shares`),
        create: (id, b) => request('POST', `/workspaces/${slug}/blueprints/${id}/shares`, b),
        revoke: (id, shareId) => request('DELETE', `/workspaces/${slug}/blueprints/${id}/shares/${shareId}`),
      },
      // Moteur WorldEdit (transform sur copie de staging, undo, export).
      worldedit: (id) => {
        const root = `/workspaces/${slug}/blueprints/${id}/worldedit`;
        return {
          state:      () => request('GET',  `${root}/state`),
          operations: () => request('GET',  `${root}/operations`),
          previewUrl: () => `/api${root}/preview`,
          exportUrl:  (off) => {
            const q = off && (off.dx || off.dy || off.dz) ? `?dx=${off.dx | 0}&dy=${off.dy | 0}&dz=${off.dz | 0}` : '';
            return `/api${root}/export${q}`;
          },
          transform:  (b) => request('POST', `${root}/transform`, b),
          transformAsync: (b) => request('POST', `${root}/transform`, { ...b, async: true }),
          job:        (jobId) => request('GET', `${root}/jobs/${jobId}`),
          undo:       () => request('POST', `${root}/undo`),
          redo:       () => request('POST', `${root}/redo`),
          floodSelect: (b) => request('POST', `${root}/select-flood`, b),
          heightmap:  (file, fields) => {
            const fd = new FormData();
            fd.append('image', file);
            for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
            return uploadFile(`${root}/heightmap`, fd);
          },
          exportHeightmap: (selection) => fetchBlob(`${root}/heightmap-export`, { selection }),
          panel:      (fields, file) => {
            const fd = new FormData();
            if (file) fd.append('image', file);
            for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
            return uploadFile(`${root}/panel`, fd);
          },
          mapart:     (fields, file) => uploadBlob(`${root}/mapart`, fields, file),
          mapBlocks:  (fields, file) => {
            const fd = new FormData();
            if (file) fd.append('image', file);
            for (const [k, v] of Object.entries(fields || {})) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
            return uploadFile(`${root}/mapblocks`, fd);
          },
          renderPreview: (fields, file) => uploadBlob(`${root}/render-preview`, fields, file),
          reset:      () => request('POST', `${root}/reset`),
          audit:      () => request('GET',  `${root}/audit`),
          // Bibliothèque de schematics (presse-papier persistés) + interop.
          schematics:    () => request('GET',  `${root}/schematics`),
          saveSchematic: (b) => request('POST', `${root}/schematics/save`, b),
          loadSchematic: (sid) => request('POST', `${root}/schematics/${sid}/load`),
          deleteSchematic: (sid) => request('DELETE', `${root}/schematics/${sid}`),
          schematicExportUrl: (sid, fmt) => `/api${root}/schematics/${sid}/export?format=${fmt || 'schem'}`,
          importSchematic: (file, fields) => {
            const fd = new FormData();
            fd.append('file', file);
            for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
            return uploadFile(`${root}/schematics/import`, fd);
          },
        };
      },
    },
    tags: {
      list:   () => request('GET',    `/workspaces/${slug}/tags`),
      rename: (name, to) => request('PUT', `/workspaces/${slug}/tags/${encodeURIComponent(name)}`, { to }),
      remove: (name) => request('DELETE', `/workspaces/${slug}/tags/${encodeURIComponent(name)}`),
    },
    summary: () => request('GET', `/workspaces/${slug}/summary`),
    // "Nouveautés" badges: counts since the member's last visit + mark-seen.
    activityCount: () => request('GET', `/workspaces/${slug}/activity-count`),
    markSeen:      () => request('POST', `/workspaces/${slug}/activity-count/seen`),
  }),

  // ── Writing space (RP / worldbuilding « Nostra ») ──
  // Public reading endpoints (no auth) + admin CRUD (admin cookie required).
  // Public reading API — projects → books, project-scoped characters/glossary.
  ecriture: {
    list:       () => request('GET', '/ecriture'),
    project:    (slug) => request('GET', `/ecriture/${slug}`),
    work:       (project, work) => request('GET', `/ecriture/${project}/${work}`),
    personnage: (project, slug) => request('GET', `/ecriture/${project}/personnages/${slug}`),
  },
  writing: {
    projects: {
      list:    () => request('GET', '/writing/projects'),
      get:     (id) => request('GET', `/writing/projects/${id}`),
      create:  (b) => request('POST', '/writing/projects', b),
      update:  (id, b) => request('PUT', `/writing/projects/${id}`, b),
      remove:  (id) => request('DELETE', `/writing/projects/${id}`),
      reorder: (order) => request('POST', '/writing/projects/reorder', { order }),
    },
    works: {
      get:       (id) => request('GET', `/writing/works/${id}`),
      createIn:  (projectId, b) => request('POST', `/writing/projects/${projectId}/works`, b),
      update:    (id, b) => request('PUT', `/writing/works/${id}`, b),
      remove:    (id) => request('DELETE', `/writing/works/${id}`),
      reorderIn: (projectId, order) => request('POST', `/writing/projects/${projectId}/works/reorder`, { order }),
    },
    chapters: {
      create:  (workId, b) => request('POST', `/writing/works/${workId}/chapters`, b),
      update:  (id, b) => request('PUT', `/writing/chapters/${id}`, b),
      remove:  (id) => request('DELETE', `/writing/chapters/${id}`),
      reorder: (workId, order) => request('POST', `/writing/works/${workId}/chapters/reorder`, { order }),
    },
    media: {
      create:  (b) => request('POST', '/writing/media', b),
      update:  (id, b) => request('PUT', `/writing/media/${id}`, b),
      remove:  (id) => request('DELETE', `/writing/media/${id}`),
      reorder: (order) => request('POST', '/writing/media/reorder', { order }),
    },
    // Project-scoped CRUD shaped for RelationalList ({ list, create, update, remove, reorder }).
    charactersFor: (projectId) => ({
      list:    () => request('GET', `/writing/projects/${projectId}/characters`),
      create:  (b) => request('POST', `/writing/projects/${projectId}/characters`, b),
      update:  (id, b) => request('PUT', `/writing/characters/${id}`, b),
      remove:  (id) => request('DELETE', `/writing/characters/${id}`),
      reorder: (order) => request('POST', `/writing/projects/${projectId}/characters/reorder`, { order }),
    }),
    // Map hierarchy (admin « Cartes »): world maps (giant 2D atlases with POI)
    // per project + local voxel maps per work. Zone update/remove are global.
    worldmaps: {
      listFor:   (projectId) => request('GET', `/writing/projects/${projectId}/worldmaps`),
      createFor: (projectId, b) => request('POST', `/writing/projects/${projectId}/worldmaps`, b),
      update:    (id, b) => request('PUT', `/writing/worldmaps/${id}`, b),
      remove:    (id) => request('DELETE', `/writing/worldmaps/${id}`),
      zonesFor:  (worldmapId) => ({
        list:   () => request('GET', `/writing/worldmaps/${worldmapId}/zones`),
        create: (b) => request('POST', `/writing/worldmaps/${worldmapId}/zones`, b),
        update: (id, b) => request('PUT', `/writing/map-zones/${id}`, b),
        remove: (id) => request('DELETE', `/writing/map-zones/${id}`),
      }),
    },
    workMapZonesFor: (workId) => ({
      list:   () => request('GET', `/writing/works/${workId}/map-zones`),
      create: (b) => request('POST', `/writing/works/${workId}/map-zones`, b),
      update: (id, b) => request('PUT', `/writing/map-zones/${id}`, b),
      remove: (id) => request('DELETE', `/writing/map-zones/${id}`),
    }),
    // Legacy project-level zones (pre-hierarchy).
    mapZonesFor: (projectId) => ({
      list:   () => request('GET', `/writing/projects/${projectId}/map-zones`),
      create: (b) => request('POST', `/writing/projects/${projectId}/map-zones`, b),
      update: (id, b) => request('PUT', `/writing/map-zones/${id}`, b),
      remove: (id) => request('DELETE', `/writing/map-zones/${id}`),
    }),
    glossaryFor: (projectId) => ({
      list:    () => request('GET', `/writing/projects/${projectId}/glossary`),
      create:  (b) => request('POST', `/writing/projects/${projectId}/glossary`, b),
      update:  (id, b) => request('PUT', `/writing/glossary/${id}`, b),
      remove:  (id) => request('DELETE', `/writing/glossary/${id}`),
      reorder: (order) => request('POST', `/writing/projects/${projectId}/glossary/reorder`, { order }),
    }),
  },

  // Global
  events:   (params = {}) => {
    const q = new URLSearchParams();
    if (params.from !== undefined) q.set('from', params.from);
    if (params.to !== undefined) q.set('to', params.to);
    const s = q.toString();
    return request('GET', `/me/events${s ? `?${s}` : ''}`);
  },
  comments: (targetType, targetId = 0) =>
    request('GET', `/comments?target_type=${targetType}&target_id=${targetId}`),
  addComment:    (targetType, targetId, body) =>
    request('POST', '/comments', { targetType, targetId, body }),
  deleteComment: (id) => request('DELETE', `/comments/${id}`),
};
