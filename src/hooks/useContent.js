import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { currently as defaultCurrently } from '../data/currently';
import { education as defaultEducation } from '../data/education';
import { experience as defaultExperience } from '../data/experience';
import { projects as defaultProjects } from '../data/projects';
import { tracks as defaultTracks } from '../data/tracks';

const FALLBACKS = {
  projects: defaultProjects,
  tracks: defaultTracks,
  education: defaultEducation,
  experience: defaultExperience,
  currently: defaultCurrently,
};

export function useContent() {
  const [data, setData] = useState(FALLBACKS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const names = Object.keys(FALLBACKS);
    Promise.all(
      names.map((n) =>
        api.list(n).then(
          (rows) => [n, rows],
          () => [n, FALLBACKS[n]],
        ),
      ),
    ).then((pairs) => {
      if (!alive) return;
      const next = {};
      for (const [n, rows] of pairs) next[n] = rows && rows.length ? rows : FALLBACKS[n];
      setData(next);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  return { data, loaded };
}
