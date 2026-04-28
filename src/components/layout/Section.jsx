import { useReveal } from '../../hooks/useReveal';

export function Section({ id, bg, children }) {
  useReveal();
  return (
    <section id={id} style={{ background: bg || 'transparent', padding: '100px 0' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 80px' }}>{children}</div>
    </section>
  );
}
