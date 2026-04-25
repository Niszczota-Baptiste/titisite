const pulse = `
  @keyframes sk-pulse {
    0%, 100% { opacity: 0.35; }
    50%       { opacity: 0.7; }
  }
`;

let injected = false;
function injectStyle() {
  if (injected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.textContent = pulse;
  document.head.appendChild(s);
  injected = true;
}

export function Skeleton({ width = '100%', height = 16, radius = 6, style }) {
  injectStyle();
  return (
    <div style={{
      width, height,
      borderRadius: radius,
      background: 'rgba(80,50,130,0.18)',
      animation: 'sk-pulse 1.4s ease-in-out infinite',
      flexShrink: 0,
      ...style,
    }} />
  );
}

export function SkeletonList({ rows = 4, rowHeight = 64 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          background: 'rgba(14,9,28,0.72)',
          border: '1px solid rgba(80,50,130,0.24)',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          height: rowHeight,
        }}>
          <Skeleton width={40} height={40} radius="50%" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="40%" height={13} />
            <Skeleton width="60%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
