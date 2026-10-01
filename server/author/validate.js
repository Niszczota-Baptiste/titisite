import { db } from '../db.js';
import { COMMON_FIELDS, KIND_FIELDS } from './enums.js';

// Validation/coercition des champs d'un élément. Toute entrée utilisateur
// passe par ici avant d'atteindre une requête : un champ inconnu est ignoré
// (jamais interpolé dans du SQL — les noms de colonnes viennent des tables de
// enums.js), un champ invalide lève AuthorValidationError → 422 explicite.

export class AuthorValidationError extends Error {
  constructor(code, field = null) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function asId(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined; // undefined = invalide
}

export function cleanText(v, max, field, { trim = false, required = false } = {}) {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new AuthorValidationError('invalid_type', field);
  let s = String(v);
  if (trim) s = s.trim();
  if (required && !s.trim()) throw new AuthorValidationError('required', field);
  if (s.length > max) throw new AuthorValidationError('too_long', field);
  return s;
}

export function cleanColor(v, field = 'color') {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v !== 'string' || !COLOR_RE.test(v)) throw new AuthorValidationError('invalid_color', field);
  return v.toLowerCase();
}

function coerce(def, value, projectId) {
  const f = def.key;
  switch (def.type) {
    case 'text':
      return cleanText(value, def.max, f, { trim: !!def.required, required: !!def.required });
    case 'color':
      return cleanColor(value, f);
    case 'int': {
      if ((value === null || value === '' || value === undefined) && def.nullable) return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < def.min || n > def.max) throw new AuthorValidationError('invalid_number', f);
      return n;
    }
    case 'number': {
      if (value === null || value === '' || value === undefined) return null;
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new AuthorValidationError('invalid_number', f);
      return n;
    }
    case 'bool':
      return value === true || value === 1 || value === '1' ? 1 : 0;
    case 'enum': {
      if (!def.values().includes(value)) throw new AuthorValidationError('invalid_value', f);
      return value;
    }
    case 'date': {
      if (value === null || value === '' || value === undefined) return null;
      if (typeof value !== 'string' || !DATE_RE.test(value)) throw new AuthorValidationError('invalid_date', f);
      return value;
    }
    case 'category': {
      const id = asId(value);
      if (id === undefined) throw new AuthorValidationError('invalid_category', f);
      if (id === null) return null;
      const ok = db.prepare(`SELECT 1 FROM author_categories WHERE id = ? AND project_id = ? AND domain = ?`)
        .get(id, projectId, def.domain);
      if (!ok) throw new AuthorValidationError('invalid_category', f);
      return id;
    }
    case 'timeline': {
      const id = asId(value);
      if (id === undefined) throw new AuthorValidationError('invalid_timeline', f);
      if (id === null) return null;
      const ok = db.prepare(`SELECT 1 FROM author_timelines WHERE id = ? AND project_id = ?`).get(id, projectId);
      if (!ok) throw new AuthorValidationError('invalid_timeline', f);
      return id;
    }
    default:
      throw new AuthorValidationError('invalid_type', f);
  }
}

// Sépare l'entrée en { common: {col: v}, specific: {col: v}, keys: [...] }.
// `partial` : seules les clés présentes sont validées (PUT partiel) ; sinon
// les champs requis manquants lèvent.
export function validateFields(kind, input, projectId, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const common = {};
  const specific = {};
  const keys = [];
  for (const def of COMMON_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, def.key)) {
      if (!partial && def.required) throw new AuthorValidationError('required', def.key);
      continue;
    }
    common[def.col] = coerce(def, src[def.key], projectId);
    keys.push(def.key);
  }
  for (const def of KIND_FIELDS[kind] || []) {
    if (!Object.prototype.hasOwnProperty.call(src, def.key)) continue;
    specific[def.col] = coerce(def, src[def.key], projectId);
    keys.push(def.key);
  }
  return { common, specific, keys };
}

// Liste de noms de tags → noms nettoyés, dédoublonnés (insensible à la casse).
export function cleanTagNames(list) {
  if (!Array.isArray(list)) throw new AuthorValidationError('invalid_tags', 'tags');
  if (list.length > 50) throw new AuthorValidationError('too_many_tags', 'tags');
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const name = String(raw ?? '').trim().replace(/^#/, '').slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}
