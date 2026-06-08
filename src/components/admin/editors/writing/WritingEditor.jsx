import { useState } from 'react';
import { ProjectsEditor } from './ProjectsEditor';
import { ProjectWorkspace } from './ProjectWorkspace';

// Back-office for the writing space. Top level lists the projects (universes);
// opening one drops into its content workspace (books / characters / glossary).
export function WritingEditor() {
  const [open, setOpen] = useState(null); // { id, title } | null

  if (open) {
    return (
      <ProjectWorkspace
        projectId={open.id}
        projectTitle={open.title}
        onBack={() => setOpen(null)}
      />
    );
  }
  return <ProjectsEditor onOpen={(id, title) => setOpen({ id, title })} />;
}
