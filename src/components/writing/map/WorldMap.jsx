import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { hexToRgb } from '../tokens';
import { MapHud, zoneMatches } from './MapHud';
import { ZonePanel } from './ZonePanel';

// three.js + fiber + drei live in this chunk only — loaded when the map
// actually scrolls into view, never as part of the main bundle.
const MapScene = lazy(() => import('./Scene'));

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Heuristic render quality: small screens and low-core devices get fewer
// particles/stars and a capped devicePixelRatio.
function detectQuality(isMobile) {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return isMobile || cores <= 4 ? 'low' : 'high';
}

// Public 3D world map of a writing project. `map` is the `{ biome, zones }`
// payload of /api/ecriture/:project; characters/glossary feed the Markdown
// tokens inside zone contents.
export function WritingWorldMap({ map, accent, seed, characters = [], glossary = [], onNavigate }) {
  const isMobile = useIsMobile(720);
  const container = useRef(null);
  const [visible, setVisible] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const rgb = hexToRgb(accent) || '201,168,232';
  const zones = map.zones;

  // Lazy mount: the WebGL context (and the three.js chunk) only spin up when
  // the map approaches the viewport.
  useEffect(() => {
    if (visible || !container.current || typeof IntersectionObserver === 'undefined') {
      if (!visible && typeof IntersectionObserver === 'undefined') setVisible(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '300px' },
    );
    obs.observe(container.current);
    return () => obs.disconnect();
  }, [visible]);

  const dimmedIds = useMemo(() => {
    if (!search.trim() && !category) return new Set();
    return new Set(zones.filter((z) => !zoneMatches(z, search, category)).map((z) => z.id));
  }, [zones, search, category]);

  const matching = zones.length - dimmedIds.size;
  const selected = selectedId != null ? zones.find((z) => z.id === selectedId) : null;
  const quality = useMemo(() => detectQuality(isMobile), [isMobile]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Carte interactive du monde"
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18,
        height: isMobile ? 'min(74vh, 560px)' : 'clamp(440px, 64vh, 700px)',
        border: `1px solid rgba(${rgb},0.28)`,
        background: 'radial-gradient(ellipse at 50% 30%, rgba(30,18,58,0.8), rgba(8,5,18,0.95))',
        boxShadow: `0 24px 80px rgba(0,0,0,0.5), inset 0 0 120px rgba(${rgb},0.05)`,
      }}
    >
      {visible && (
        <Suspense fallback={<Loading accent={accent} rgb={rgb} />}>
          <MapScene
            zones={zones}
            biomeKey={map.biome}
            accent={accent}
            seed={seed || zones.length * 17 + 3}
            quality={quality}
            intro={!prefersReducedMotion()}
            hoveredId={hoveredId}
            selectedId={selectedId}
            dimmedIds={dimmedIds}
            onHover={setHoveredId}
            onSelect={setSelectedId}
          />
        </Suspense>
      )}
      {!visible && <Loading accent={accent} rgb={rgb} />}

      <MapHud
        zones={zones}
        matching={matching}
        search={search}
        setSearch={setSearch}
        category={category}
        setCategory={setCategory}
        accent={accent}
        compact={isMobile}
      />

      {selected && (
        <ZonePanel
          zone={selected}
          accent={accent}
          characters={characters}
          glossary={glossary}
          onClose={() => setSelectedId(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* Screen-reader / keyboard fallback: every zone reachable without WebGL */}
      <nav aria-label="Zones de la carte" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        <ul>
          {zones.map((z) => (
            <li key={z.id}>
              <button onClick={() => setSelectedId(z.id)}>{z.title}{z.category ? ` (${z.category})` : ''}</button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Loading({ accent, rgb }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        border: `2px solid rgba(${rgb},0.2)`, borderTopColor: accent,
        animation: 'wmap-spin 0.9s linear infinite',
      }} />
      <style>{'@keyframes wmap-spin { to { transform: rotate(360deg); } }'}</style>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'rgba(180,170,200,0.65)' }}>
        chargement de la carte…
      </p>
    </div>
  );
}
