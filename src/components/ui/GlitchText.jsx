import { ACCENTS } from '../../data/constants';

export function GlitchText({ text, accent, style, gradient }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const mainStyle = gradient
    ? {
        position: 'relative',
        zIndex: 2,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundImage: gradient,
      }
    : { position: 'relative', zIndex: 2 };

  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <span style={mainStyle}>{text}</span>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0,
          WebkitTextFillColor: 'rgba(80,230,255,0.72)',
          color: 'rgba(80,230,255,0.72)',
          animation: 'glitch1 5.5s infinite',
          zIndex: 1, pointerEvents: 'none', userSelect: 'none',
          fontFamily: 'inherit', fontSize: 'inherit',
          fontWeight: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit',
        }}
      >
        {text}
      </span>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0,
          WebkitTextFillColor: acc.hex, color: acc.hex, opacity: 0.82,
          animation: 'glitch2 5.5s infinite 0.09s',
          zIndex: 1, pointerEvents: 'none', userSelect: 'none',
          fontFamily: 'inherit', fontSize: 'inherit',
          fontWeight: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit',
        }}
      >
        {text}
      </span>
    </span>
  );
}
