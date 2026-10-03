import { Navigate, Route, Routes } from 'react-router-dom';
import { CommentsPage } from '../comments/CommentsPage';
import { AuthorProvider } from '../context';
import { ProjectGuard } from '../ProjectGuard';
import { Graph } from '../pages/Graph';
import { SearchPage } from '../pages/SearchPage';
import { Shell } from '../Shell';
import { GuestBoard, GuestBoards } from './GuestBoards';
import { GuestChapters } from './GuestChapters';
import { GuestEntity } from './GuestEntity';
import { GuestHome } from './GuestHome';
import { GuestList } from './GuestList';
import { GuestTimeline } from './GuestTimeline';

// Espace d'un invité « omniscient » : tout le livre en lecture (sauf la boîte
// à idées, que le serveur ne lui sert jamais) et des commentaires. Aucun écran
// d'édition n'est monté ici : pas de champ, pas d'autosave, pas de corbeille.

export default function GuestProject({ pid, access, theme, setTheme }) {
  return (
    <AuthorProvider pid={pid} access={access}>
      <ProjectGuard>
        <Shell theme={theme} setTheme={setTheme}>
          <Routes>
            <Route index element={<GuestHome />} />
            <Route path="chapitres" element={<GuestChapters />} />
            <Route path="plan" element={<Navigate to={`/auteur/${pid}/chapitres`} replace />} />
            <Route path="personnages" element={<GuestList kind="character" />} />
            <Route path="lieux" element={<GuestList kind="place" />} />
            <Route path="univers" element={<GuestList kind="lore" />} />
            <Route path="evenements" element={<Navigate to={`/auteur/${pid}/chronologie`} replace />} />
            <Route path="chronologie" element={<GuestTimeline />} />
            <Route path="graphe" element={<Graph />} />
            <Route path="tableaux" element={<GuestBoards />} />
            <Route path="tableaux/:boardId" element={<GuestBoard />} />
            <Route path="e/:id" element={<GuestEntity />} />
            <Route path="commentaires" element={<CommentsPage />} />
            <Route path="recherche" element={<SearchPage />} />
            <Route path="*" element={<Navigate to={`/auteur/${pid}`} replace />} />
          </Routes>
        </Shell>
      </ProjectGuard>
    </AuthorProvider>
  );
}
