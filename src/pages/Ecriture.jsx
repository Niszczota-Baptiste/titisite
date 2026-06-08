import { Route, Routes } from 'react-router-dom';
import { CharacterPage } from '../components/writing/CharacterPage';
import { EcritureLibrary } from '../components/writing/EcritureLibrary';
import { Reader } from '../components/writing/Reader';

// Public writing space, mounted at /projets/ecriture/* :
//   index                       → library + atelier (characters, glossary)
//   personnages/:slug           → full character sheet
//   :slug                       → reading mode for one work
export default function Ecriture() {
  return (
    <Routes>
      <Route index element={<EcritureLibrary />} />
      <Route path="personnages/:slug" element={<CharacterPage />} />
      <Route path=":slug" element={<Reader />} />
    </Routes>
  );
}
