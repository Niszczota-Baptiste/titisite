// Recurring-quest reset windows, anchored at 07:00 Europe/Paris.
//
// The reset is *implicit*: we never mutate rows on a schedule. Instead every
// occurrence type maps `now` to a deterministic `period_key`; "done this
// period?" is simply "does a completion row exist for the current key". This
// makes resets replayable and crash-proof — a server that was down over a
// boundary needs no catch-up job, because the key is recomputed on read.
//
//   simple        → 'once'                (never resets)
//   journaliere   → 'd:YYYY-MM-DD'        (day starts 07:00 Paris)
//   hebdomadaire  → 'w:YYYY-MM-DD'        (Friday 07:00 Paris anchor date)
//   mensuelle     → 'm:YYYY-MM'           (1st 07:00 Paris)
//
// Implementation note: we read the Paris wall-clock fields via Intl and treat
// them as UTC so plain Date arithmetic gives the right calendar boundaries.
// Twice a year a DST switch shifts the 07:00 anchor by one hour; that is
// acceptable here (key granularity is day/week/month, not the hour).

const TZ = 'Europe/Paris';
const RESET_HOUR = 7;
export const RECURRING = new Set(['journaliere', 'hebdomadaire', 'mensuelle']);

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

// Paris wall-clock components of an instant.
function parisParts(date) {
  const p = {};
  // eslint-disable-next-line security/detect-object-injection -- `type` is a fixed Intl part name, not user input
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    y: +p.year, mo: +p.month, d: +p.day,
    h: +(p.hour === '24' ? '0' : p.hour), mi: +p.minute, s: +p.second,
  };
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;

/**
 * Deterministic period key for a quest occurrence type at a given instant.
 * Returns 'once' for non-recurring quests.
 */
export function currentPeriodKey(occurrenceType, date = new Date()) {
  if (!RECURRING.has(occurrenceType)) return 'once';
  const p = parisParts(date);
  // Shift the Paris wall-clock back by RESET_HOUR so a plain date/week/month of
  // the shifted instant maps to the window that started at 07:00.
  const shifted = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - RESET_HOUR * 3600_000);
  const y = shifted.getUTCFullYear();
  const mo = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();

  if (occurrenceType === 'journaliere') return `d:${iso(y, mo, d)}`;
  if (occurrenceType === 'mensuelle') return `m:${y}-${pad(mo)}`;
  // hebdomadaire: anchor date = most recent Friday (getUTCDay 5) at/before shifted.
  const daysSinceFriday = (shifted.getUTCDay() - 5 + 7) % 7;
  const anchor = new Date(shifted.getTime() - daysSinceFriday * 86_400_000);
  return `w:${iso(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate())}`;
}

/**
 * Unix seconds of the *next* reset boundary strictly after `date`, or null for
 * non-recurring quests. Used for "prochain reset" badges and the cockpit feed.
 */
export function nextResetAt(occurrenceType, date = new Date()) {
  if (!RECURRING.has(occurrenceType)) return null;
  const p = parisParts(date);
  // Current Paris wall-clock as UTC, and the offset to convert a wall target
  // back into a real instant (constant across the short horizons we compute).
  const nowWallUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  const offset = nowWallUTC - date.getTime();
  let boundaryWallUTC;

  if (occurrenceType === 'journaliere') {
    boundaryWallUTC = Date.UTC(p.y, p.mo - 1, p.d, RESET_HOUR, 0, 0);
    if (p.h >= RESET_HOUR) boundaryWallUTC += 86_400_000;
  } else if (occurrenceType === 'hebdomadaire') {
    const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
    let days = (5 - dow + 7) % 7;
    if (days === 0 && p.h >= RESET_HOUR) days = 7;
    boundaryWallUTC = Date.UTC(p.y, p.mo - 1, p.d, RESET_HOUR, 0, 0) + days * 86_400_000;
  } else { // mensuelle
    boundaryWallUTC = (p.d === 1 && p.h < RESET_HOUR)
      ? Date.UTC(p.y, p.mo - 1, 1, RESET_HOUR, 0, 0)
      : Date.UTC(p.y, p.mo, 1, RESET_HOUR, 0, 0); // JS rolls month over
  }
  return Math.floor((boundaryWallUTC - offset) / 1000);
}

/** Human label for a period key (for history display). */
export function periodLabel(periodKey) {
  if (!periodKey || periodKey === 'once') return 'Unique';
  const [kind, rest] = periodKey.split(':');
  if (kind === 'd') return rest;
  if (kind === 'm') return rest;
  if (kind === 'w') return `Semaine du ${rest}`;
  return periodKey;
}
