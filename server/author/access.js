import { db } from '../db.js';
import { SHARE_ROLES } from './enums.js';

// Contrôle d'accès de l'atelier d'auteur — trois verrous indépendants, tous
// côté serveur (l'interface ne fait que refléter `canAuthor`) :
//
//   1. requireAuthor : rôle `admin` ET drapeau `users.can_author`. AUCUN
//      outrepassement admin : un second administrateur n'entre pas.
//   2. Le drapeau n'est accepté par aucune route d'édition des comptes : il
//      est recalculé à chaque démarrage depuis la configuration serveur
//      (syncAuthorOwner) — on ne peut pas se l'attribuer depuis l'interface.
//   3. resolveAuthorProject : chaque donnée appartient à un projet, et un
//      projet n'est servi qu'à son owner_id. Sinon 404 — on ne distingue pas
//      « inexistant » de « pas à toi » (rien ne doit permettre de sonder).
//
// Partage (author_project_shares) : le propriétaire peut ouvrir un livre en
// LECTURE à d'autres comptes — 'omniscient' ou 'lecteur'. Un invité passe la
// garde d'entrée (requireAuthorAccess) uniquement s'il a un partage actif, et
// resolveAuthorAccess pose req.access ; les routes du propriétaire et celles
// des invités sont deux routeurs DISTINCTS (server/routes/author.js) : une
// requête invitée n'atteint jamais un gestionnaire d'écriture.

// AUTHOR_OWNER_EMAIL désigne le compte propriétaire ; à défaut, ADMIN_EMAIL
// (le compte administrateur créé au premier démarrage). Rejoué à chaque boot :
// la configuration est la seule source de vérité, un drapeau posé à la main
// en base sur un autre compte est retiré au redémarrage suivant.
export function syncAuthorOwner(env = process.env) {
  const email = String(env.AUTHOR_OWNER_EMAIL || env.ADMIN_EMAIL || '').toLowerCase().trim();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE users SET can_author = 0 WHERE can_author <> 0 AND (email <> ? OR role <> 'admin')`).run(email);
    if (email) {
      db.prepare(`UPDATE users SET can_author = 1 WHERE email = ? AND role = 'admin'`).run(email);
    }
  });
  tx();
  const owner = email
    ? db.prepare(`SELECT id, email FROM users WHERE email = ? AND role = 'admin'`).get(email)
    : null;
  return { owner: owner?.email ?? null };
}

export function isAuthor(user) {
  return !!user && user.role === 'admin' && user.can_author === 1;
}

// Partage actif : le propriétaire du livre doit encore être l'auteur désigné
// (admin + can_author). Si la configuration change de propriétaire, les
// partages de l'ancien se ferment d'eux-mêmes au lieu de rester ouverts.
const SHARE_JOIN = `
  FROM author_project_shares s
  JOIN author_projects p ON p.id = s.project_id
  JOIN users o ON o.id = p.owner_id AND o.role = 'admin' AND o.can_author = 1
`;

export function hasActiveShare(userId) {
  return !!db.prepare(`SELECT 1 ${SHARE_JOIN} WHERE s.user_id = ? LIMIT 1`).get(userId);
}

export function sharedProject(projectId, userId) {
  const row = db.prepare(`
    SELECT p.*, s.role AS share_role, o.name AS owner_name ${SHARE_JOIN}
    WHERE s.project_id = ? AND s.user_id = ?
  `).get(projectId, userId);
  return row && SHARE_ROLES.includes(row.share_role) ? row : null;
}

export function sharedProjectsFor(userId) {
  return db.prepare(`
    SELECT p.id, p.title, p.subtitle, p.color, s.role AS share_role, o.name AS owner_name ${SHARE_JOIN}
    WHERE s.user_id = ? ORDER BY p.title COLLATE NOCASE
  `).all(userId).filter((r) => SHARE_ROLES.includes(r.share_role));
}

// Ce que /auth/me expose à l'interface (confort d'affichage uniquement).
export function authorFlags(user) {
  const canAuthor = isAuthor(user);
  return { canAuthor, authorShared: !canAuthor && !!user?.id && hasActiveShare(user.id) };
}

export function requireAuthor(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (!isAuthor(req.user)) return res.status(403).json({ error: 'forbidden' });
  return next();
}

// Défense en profondeur contre le CSRF. Le cookie de session est déjà
// SameSite=Strict (barrière principale) ; on exige en plus un en-tête
// personnalisé sur toute écriture : un formulaire ou une image d'un autre site
// ne peut pas en poser, et un fetch cross-origin qui l'ajoute déclenche un
// preflight CORS que le serveur refuse. Même patron que X-Playlist-Request.
export function requireAuthorHeader(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.get('X-Author-Request') !== '1') return res.status(403).json({ error: 'csrf_header_missing' });
  return next();
}

export function projectForOwner(projectId, userId) {
  return db.prepare(`SELECT * FROM author_projects WHERE id = ? AND owner_id = ?`).get(projectId, userId);
}

export function resolveAuthorProject(req, res, next) {
  const id = Number(req.params.pid);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'not_found' });
  const project = projectForOwner(id, req.user.id);
  if (!project) return res.status(404).json({ error: 'not_found' });
  req.project = project;
  return next();
}

// Garde d'entrée de /api/author : le propriétaire, ou un invité qui a au moins
// un partage actif. Tout le reste reçoit 403 avant le moindre gestionnaire.
export function requireAuthorAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (isAuthor(req.user) || hasActiveShare(req.user.id)) return next();
  return res.status(403).json({ error: 'forbidden' });
}

// Résout le projet ET le niveau d'accès : 'owner' (propriétaire), sinon le
// rôle du partage. Ni l'un ni l'autre → 404 (pas de sonde possible).
export function resolveAuthorAccess(req, res, next) {
  const id = Number(req.params.pid);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'not_found' });
  if (isAuthor(req.user)) {
    const own = projectForOwner(id, req.user.id);
    if (own) {
      req.project = own;
      req.access = 'owner';
      return next();
    }
  }
  const shared = sharedProject(id, req.user.id);
  if (!shared) return res.status(404).json({ error: 'not_found' });
  req.project = shared;
  req.access = shared.share_role;
  return next();
}
