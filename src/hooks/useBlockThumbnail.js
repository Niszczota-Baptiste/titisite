import { useEffect, useState } from 'react';

// Renvoie l'URL (dataURL) d'une vignette 3D statique du bloc `id`, ou null si
// l'id n'a pas de modèle géométrique (→ l'appelant garde son icône plate). Le
// module three.js n'est chargé qu'à la première utilisation (import dynamique),
// et le rendu est mis en cache par id côté blockThumbnail.
export function useBlockThumbnail(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!id) { setUrl(null); return undefined; }
    let alive = true;
    import('../data/blockThumbnail')
      .then((m) => m.blockThumbnail(id, 96))
      .then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}
