import { Navigate, Route, Routes } from 'react-router-dom';
import { CommentsPage } from './comments/CommentsPage';
import { AuthorProvider } from './context';
import { Boards } from './pages/Boards';
import { Chapters } from './pages/Chapters';
import { Consistency } from './pages/Consistency';
import { Dashboard } from './pages/Dashboard';
import { EntityList } from './pages/EntityList';
import { EntityPage } from './pages/EntityPage';
import { Graph } from './pages/Graph';
import { Ideas } from './pages/Ideas';
import { Plan } from './pages/Plan';
import { SearchPage } from './pages/SearchPage';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';
import { Timeline } from './pages/Timeline';
import { Whiteboard } from './pages/Whiteboard';
import { Writer, WriterIndex } from './pages/Writer';
import { ReaderView } from './reader/ReaderProject';
import { ProjectGuard } from './ProjectGuard';
import { Shell } from './Shell';

// Atelier complet du propriétaire (chargé seulement quand le serveur répond
// access = 'owner' pour ce livre).

export default function OwnerProject({ pid, theme, setTheme }) {
  return (
    <AuthorProvider pid={pid} access="owner">
      <ProjectGuard>
        <Routes>
          {/* Aperçu de la liseuse : exactement ce que voit un lecteur. */}
          <Route path="apercu/*" element={<ReaderView pid={pid} preview theme={theme} setTheme={setTheme} />} />
          <Route path="*" element={(
            <Shell theme={theme} setTheme={setTheme}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="personnages" element={<EntityList kind="character" />} />
                <Route path="lieux" element={<EntityList kind="place" />} />
                <Route path="univers" element={<EntityList kind="lore" />} />
                <Route path="evenements" element={<EntityList kind="event" />} />
                <Route path="e/:id" element={<EntityPage />} />
                <Route path="idees" element={<Ideas />} />
                <Route path="chapitres" element={<Chapters />} />
                <Route path="plan" element={<Plan />} />
                <Route path="ecrire" element={<WriterIndex />} />
                <Route path="ecrire/:id" element={<Writer />} />
                <Route path="tableaux" element={<Boards />} />
                <Route path="tableaux/:boardId" element={<Whiteboard />} />
                <Route path="chronologie" element={<Timeline />} />
                <Route path="graphe" element={<Graph />} />
                <Route path="taches" element={<Tasks />} />
                <Route path="recherche" element={<SearchPage />} />
                <Route path="coherence" element={<Consistency />} />
                <Route path="commentaires" element={<CommentsPage />} />
                <Route path="reglages" element={<Settings />} />
                <Route path="*" element={<Navigate to={`/auteur/${pid}`} replace />} />
              </Routes>
            </Shell>
          )} />
        </Routes>
      </ProjectGuard>
    </AuthorProvider>
  );
}
