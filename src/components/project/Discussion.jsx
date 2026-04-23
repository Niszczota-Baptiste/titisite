import { Section, card, muted } from './shared';
import { Comments } from './Comments';

export function DiscussionTab() {
  return (
    <Section title="Discussion">
      <p style={{ ...muted, fontSize: 13, marginBottom: 16 }}>
        Fil général — pour tout ce qui ne rentre pas ailleurs. Les commentaires
        attachés à une feature ou un document restent dans ces sections.
      </p>
      <div style={{ ...card, padding: 20 }}>
        <Comments targetType="discussion" targetId={0} />
      </div>
    </Section>
  );
}
