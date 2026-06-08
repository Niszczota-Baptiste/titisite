import { Route, Routes } from 'react-router-dom';
import { CharacterPage } from '../components/writing/CharacterPage';
import { EcritureLibrary } from '../components/writing/EcritureLibrary';
import { ProjectPage } from '../components/writing/ProjectPage';
import { Reader } from '../components/writing/Reader';

// Public writing space, mounted at /projets/ecriture/* :
//   index                        → project index (universes)
//   :project                     → project landing (books + characters + glossary)
//   :project/personnages/:slug   → character sheet
//   :project/:work               → reading mode for one book
export default function Ecriture() {
  return (
    <Routes>
      <Route index element={<EcritureLibrary />} />
      <Route path=":project" element={<ProjectPage />} />
      <Route path=":project/personnages/:slug" element={<CharacterPage />} />
      <Route path=":project/:work" element={<Reader />} />
    </Routes>
  );
}
