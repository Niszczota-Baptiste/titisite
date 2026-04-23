import { useRef, useState } from 'react';
import { ACC, ACC_RGB, formatBytes } from './shared';

export function FileDrop({ value, onChange, accept, label = 'Glisse un fichier ici ou clique pour parcourir' }) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);

  const pick = () => inputRef.current?.click();

  const onDrop = (e) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onChange(f);
  };

  return (
    <div
      onClick={pick}
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${hover ? ACC : 'rgba(80,50,130,0.3)'}`,
        borderRadius: 10, padding: '20px 16px', textAlign: 'center',
        cursor: 'pointer', transition: 'all 0.18s',
        background: hover ? `rgba(${ACC_RGB},0.05)` : 'rgba(4,3,14,0.4)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
      {value ? (
        <div>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
            color: '#ede8f8', fontWeight: 500, marginBottom: 2,
          }}>
            {value.name}
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11, color: 'rgba(180,170,200,0.55)',
          }}>
            {formatBytes(value.size)}
          </div>
        </div>
      ) : (
        <span style={{
          fontFamily: "'Inter',sans-serif", fontSize: 13,
          color: 'rgba(180,170,200,0.55)',
        }}>
          {label}
        </span>
      )}
    </div>
  );
}

export function ProgressBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div style={{
      height: 4, background: 'rgba(80,50,130,0.18)', borderRadius: 2,
      overflow: 'hidden', marginTop: 10,
    }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: `linear-gradient(90deg, #8a60b0, ${ACC})`,
        boxShadow: `0 0 6px rgba(${ACC_RGB},0.6)`,
        transition: 'width 0.1s linear',
      }} />
    </div>
  );
}
