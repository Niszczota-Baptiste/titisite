import { useEffect, useMemo, useState } from 'react';
import { loadMinefieldCatalog } from '../data/minefieldCatalog';

// Charge (une fois, partagé via le cache du module) le codex Minefield+vanilla et
// expose des index prêts à l'emploi : par id, ensemble des ids. Utilisé par
// l'admin (recettes, shops) et le calculateur de craft des projets.
export function useCodex() {
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    let alive = true;
    loadMinefieldCatalog().then((c) => { if (alive) setCatalog(c); });
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map();
    for (const e of catalog) if (e.id && !m.has(e.id)) m.set(e.id, e);
    return m;
  }, [catalog]);

  const idSet = useMemo(() => new Set(byId.keys()), [byId]);

  return { catalog, byId, idSet };
}
