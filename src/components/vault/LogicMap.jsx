import { useMemo, useRef } from 'react';
import { layoutLogic } from './logicLayout';
import { GOLD, LEVELS, MUTED, body, panel, title } from './theme';

// Vue Logique : diagramme régénéré à chaque modification, jamais éditable.
// SVG maison (pas de dépendance), exportable en SVG ou PNG pour Discord.

export function LogicMap({ doc, categories, onOpenZone }) {
  const svgRef = useRef(null);
  const model = useMemo(() => layoutLogic(doc, categories), [doc, categories]);

  const exportSvg = () => {
    const src = serialize(svgRef.current);
    download(new Blob([src], { type: 'image/svg+xml' }), 'salle-des-coffres.svg');
  };

  const exportPng = () => {
    const src = serialize(svgRef.current);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = model.width * scale;
      canvas.height = model.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#08051a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && download(blob, 'salle-des-coffres.png'));
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(src)))}`;
  };

  if (doc.floors.length === 0) {
    return <p style={{ ...body, color: MUTED, fontSize: 13 }}>Crée un étage pour voir le diagramme.</p>;
  }

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid rgba(80,50,130,0.25)',
      }}>
        <h3 style={{ ...title, fontSize: 13, flex: 1 }}>Carte logique</h3>
        <span style={{ ...body, fontSize: 11, color: MUTED }}>régénérée automatiquement</span>
        <button type="button" onClick={exportSvg} style={btn}>SVG</button>
        <button type="button" onClick={exportPng} style={btn}>PNG</button>
      </div>

      <div style={{ overflow: 'auto', maxHeight: '70vh', background: '#08051a' }}>
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          width={model.width}
          height={model.height}
          viewBox={`0 0 ${model.width} ${model.height}`}
          style={{ display: 'block', minWidth: '100%' }}
        >
          <rect width={model.width} height={model.height} fill="#08051a" />

          {model.links.map((l) => (
            <g key={l.id}>
              <path
                d={`M ${l.x} ${l.y1} C ${l.x - 16} ${l.y1}, ${l.x - 16} ${l.y2}, ${l.x} ${l.y2}`}
                fill="none" stroke="#9ad4ae" strokeWidth="2" strokeDasharray="4 3" opacity="0.85"
              />
              <circle cx={l.x} cy={l.y1} r="3.5" fill="#9ad4ae" />
              <circle cx={l.x} cy={l.y2} r="3.5" fill="#9ad4ae" />
            </g>
          ))}

          {model.bands.map((band) => (
            <g key={band.id}>
              <rect
                x="8" y={band.y} width={model.width - 16} height={band.height} rx="10"
                fill="rgba(20,14,38,0.6)" stroke={band.color} strokeOpacity="0.4"
              />
              <text x="20" y={band.y + 22} fill={band.color} fontSize="13" fontWeight="700" fontFamily="Inter, sans-serif">
                {band.name}
              </text>
              <text x="20" y={band.y + 36} fill="rgba(180,170,200,0.6)" fontSize="10" fontFamily="JetBrains Mono, monospace">
                Y {band.yMin}–{band.yMax}
              </text>

              {band.entries.map((e) => (
                <g key={e.id}>
                  <rect x="14" y={e.y} width="76" height="18" rx="9" fill="rgba(224,82,111,0.18)" stroke="#e0526f" />
                  <text x="52" y={e.y + 13} fill="#e0526f" fontSize="9.5" textAnchor="middle" fontFamily="Inter, sans-serif">
                    ⌂ {e.label.slice(0, 12)}
                  </text>
                </g>
              ))}

              {band.zones.map((z) => (
                <g key={z.id} onClick={() => onOpenZone?.(z.id, band.id)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={z.x} y={z.y} width={z.w} height={z.h} rx="8"
                    fill={`${z.color}1f`} stroke={z.color} strokeWidth="1.5"
                    strokeDasharray={z.reserved ? '6 4' : undefined}
                  />
                  <text x={z.x + 10} y={z.y + 19} fill={z.color} fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">
                    {clip(z.name, 20)}
                  </text>
                  <text x={z.x + 10} y={z.y + 34} fill="rgba(214,206,232,0.75)" fontSize="9.5" fontFamily="Inter, sans-serif">
                    {z.reserved ? 'réservée MàJ' : `${z.stats.chests} coffres · ${z.stats.slots} slots`}
                  </text>
                  {z.categories.length > 0 && (
                    <text x={z.x + 10} y={z.y + 47} fill="rgba(180,170,200,0.65)" fontSize="9" fontFamily="Inter, sans-serif">
                      {clip(z.categories.map((c) => c.name).join(' · '), 24)}
                    </text>
                  )}
                  {!z.reserved && (
                    <>
                      <rect x={z.x + 10} y={z.y + z.h - 14} width={z.w - 20} height="6" rx="3" fill="rgba(120,100,170,0.25)" />
                      <rect
                        x={z.x + 10} y={z.y + z.h - 14} rx="3" height="6"
                        width={Math.max(0, Math.min(1, z.stats.slots > 0 ? z.stats.needed / z.stats.slots : 0)) * (z.w - 20)}
                        fill={LEVELS[z.stats.level].color}
                      />
                    </>
                  )}
                </g>
              ))}

              {band.zones.length === 0 && (
                <text x={112} y={band.y + 52} fill="rgba(180,170,200,0.45)" fontSize="11" fontFamily="Inter, sans-serif">
                  aucune zone sur cet étage
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 14, padding: '8px 14px', borderTop: '1px solid rgba(80,50,130,0.25)', flexWrap: 'wrap' }}>
        <Legend color="#9ad4ae" label="escalier" />
        <Legend color="#e0526f" label="entrée" />
        <Legend color={GOLD} label="zone réservée (tirets)" />
        {Object.entries(LEVELS).map(([k, v]) => <Legend key={k} color={v.color} label={v.label} />)}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...body, fontSize: 10.5, color: MUTED }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function serialize(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const btn = {
  padding: '4px 10px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: GOLD,
};
