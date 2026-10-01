import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { humanError } from './ui';

// Structure du livre partagée par « Chapitres » et « Plan » : colonnes = actes
// (+ « Hors actes »), éléments = chapitres et moments forts dans un même ordre.
// Un déplacement est appliqué tout de suite à l'écran puis envoyé en entier
// (PUT /plan) ; la réponse du serveur, renumérotée, fait foi.

export const itemKey = (it) => `${it.type}:${it.id}`;
const colKey = (actId) => `act:${actId ?? 'none'}`;

function toColumns(plan) {
  return [
    ...plan.acts.map((a) => ({ key: colKey(a.id), act: a, actId: a.id, items: a.items })),
    { key: colKey(null), act: null, actId: null, items: plan.unassigned },
  ];
}

export function usePlan() {
  const { P, version, bump } = useAuthor();
  const toast = useToast();
  const [cols, setCols] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => P.plan.get().then((p) => setCols(toColumns(p))).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const save = useCallback(async (next, extra = {}) => {
    setCols(next);
    try {
      const plan = await P.plan.save({
        columns: next.map((c) => ({ actId: c.actId, items: c.items.map((i) => ({ type: i.type, id: i.id })) })),
        ...extra,
      });
      setCols(toColumns(plan));
      bump();
    } catch (err) {
      toast.error(humanError(err));
      load();
    }
  }, [P, bump, toast, load]);

  // Déplace l'élément `key` (« chapter:12 ») vers la colonne `to` au rang `index`.
  const move = useCallback((key, to, index) => {
    if (!cols) return;
    let moving = null;
    const stripped = cols.map((c) => {
      const items = c.items.filter((i) => { if (itemKey(i) === key) { moving = i; return false; } return true; });
      return { ...c, items };
    });
    if (!moving) return;
    const next = stripped.map((c) => {
      if (c.key !== to) return c;
      const items = [...c.items];
      items.splice(Math.max(0, Math.min(index, items.length)), 0, { ...moving, actId: c.actId });
      return { ...c, items };
    });
    save(next);
  }, [cols, save]);

  const moveAct = useCallback((actId, delta) => {
    if (!cols) return;
    const acts = cols.filter((c) => c.actId !== null);
    const i = acts.findIndex((c) => c.actId === actId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= acts.length) return;
    const reordered = [...acts];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const next = [...reordered, cols.find((c) => c.actId === null)];
    save(next, { actOrder: reordered.map((c) => c.actId) });
  }, [cols, save]);

  return { cols, error, setError, load, move, moveAct, colKey };
}
