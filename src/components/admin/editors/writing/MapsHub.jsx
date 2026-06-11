import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { ACC, ACC_RGB } from '../../ui';
import { MapEditor } from './MapEditor';
import { SelectField } from './widgets';
import { WorldmapsEditor } from './WorldmapsEditor';

// « Cartes » tab of a project workspace, the two levels of the map hierarchy:
// - Cartes-mondes : giant 2D atlases of the universe (POI → lore pages) ;
// - Cartes locales : the voxel 3D/2D map of one element (cité, région…),
//   shown on its reader page.
export function MapsHub({ projectId }) {
  const [level, setLevel] = useState('monde'); // 'monde' | 'locale'
  const [works, setWorks] = useState([]);
  const [workId, setWorkId] = useState('');

  useEffect(() => {
    let alive = true;
    api.writing.projects.get(projectId)
      .then((p) => { if (alive) setWorks(p.books || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  const chip = (on) => ({
    background: on ? `rgba(${ACC_RGB},0.16)` : 'transparent',
    border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
    color: on ? ACC : 'rgba(180,170,200,0.7)', borderRadius: 16,
    padding: '6px 16px', cursor: 'pointer',
    fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: on ? 700 : 500,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" style={chip(level === 'monde')} onClick={() => setLevel('monde')}>🗺 Cartes-mondes</button>
        <button type="button" style={chip(level === 'locale')} onClick={() => setLevel('locale')}>🏯 Cartes locales (par élément)</button>
      </div>

      {level === 'monde' && <WorldmapsEditor projectId={projectId} />}

      {level === 'locale' && (
        <div>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(180,170,200,0.65)', lineHeight: 1.6, marginBottom: 12 }}>
            Chaque élément (cité, région, livre…) peut porter sa propre carte
            voxel 3D/2D, affichée sur sa page de lecture — c'est elle qu'on
            découvre en cliquant un lieu de la carte-monde.
          </p>
          <div style={{ maxWidth: 360 }}>
            <SelectField
              label="Élément à cartographier"
              value={workId}
              onChange={setWorkId}
              options={works.map((w) => ({ value: String(w.id), label: `${w.type || 'Livre'} · ${w.title}` }))}
              allowEmpty="— choisir un élément —"
            />
          </div>
          {workId && <MapEditor key={workId} projectId={projectId} workId={Number(workId)} />}
        </div>
      )}
    </div>
  );
}
