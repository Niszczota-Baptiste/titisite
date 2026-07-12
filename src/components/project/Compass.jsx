import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Button, Modal, muted } from './shared';

// 🧭 Boussole : de « où je suis » vers « où est la cible » (un coffre, un
// point de quête…). La position vient soit d'un collage F3+C / « x y z »
// (mémorisé en localStorage), soit du suivi cockpit : l'app locale pousse la
// ligne F3+C du presse-papiers sur POST /api/quests/cockpit/:token/position
// et on la relit ici (GET /api/me/cockpit/position, admin). Conventions
// Minecraft : nord = −Z, est = +X ; yaw 0 = sud, croissant horaire.

// Tokenisation simple (même logique que server/quests/position.js) : « @s »
// puis 3 à 5 nombres ; le monde est le token après « in » s'il existe.
export function parsePositionText(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 500) return null;
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  const at = tokens.indexOf('@s');
  if (at >= 0) {
    const inIdx = tokens.indexOf('in');
    const world = inIdx >= 0 && tokens[inIdx + 1] ? tokens[inIdx + 1] : '';
    const nums = tokens.slice(at + 1, at + 6).map(Number);
    if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) {
      return {
        world, x: nums[0], y: nums[1], z: nums[2],
        yaw: Number.isFinite(nums[3]) ? nums[3] : null,
      };
    }
    return null;
  }
  const parts = s.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { world: '', x: parts[0], y: parts[1], z: parts[2], yaw: null };
  }
  return null;
}

const isNether = (w) => /nether/i.test(String(w || ''));
const CARDINALS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];

// Cap (° horaire depuis le nord) du point (px,pz) vers (tx,tz).
function bearingOf(px, pz, tx, tz) {
  const deg = Math.atan2(tx - px, -(tz - pz)) * (180 / Math.PI);
  return (deg + 360) % 360;
}
// Yaw Minecraft (0 = sud) → cap boussole (0 = nord).
const yawToCompass = (yaw) => (((yaw % 360) + 360 + 180) % 360);

// Géométrie boussole → cap/distance/ΔY + virage relatif si le yaw est connu.
// Si un seul des deux mondes est le Nether, les coordonnées cibles sont
// converties (×8 / ÷8) pour que distance et cap restent parlants.
export function steering(pos, target) {
  let tx = target.x;
  let tz = target.z;
  let crossWorld = false;
  if (pos.world && target.world && isNether(pos.world) !== isNether(target.world)) {
    crossWorld = true;
    const f = isNether(pos.world) ? 1 / 8 : 8;
    tx = target.x * f;
    tz = target.z * f;
  }
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const bearing = bearingOf(pos.x, pos.z, tx, tz);
  const cardinal = CARDINALS[Math.round(bearing / 45) % 8];
  const dy = target.y != null && pos.y != null ? Math.round(target.y - pos.y) : null;
  let turn = null;
  if (pos.yaw != null) {
    turn = ((bearing - yawToCompass(pos.yaw) + 540) % 360) - 180; // −180..180, <0 = gauche
  }
  return { bearing, distance: Math.round(distance), cardinal, dy, turn, crossWorld };
}

function fmtAgo(unix) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  return `il y a ${Math.floor(s / 3600)} h`;
}

const POS_KEY = 'mc_compass_position';

export function CompassModal({ open, onClose, target }) {
  // Position manuelle (collée), persistée pour ne pas la retaper.
  const [manual, setManual] = useState(() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY)) || null; } catch { return null; }
  });
  const [pasted, setPasted] = useState('');
  const [pasteErr, setPasteErr] = useState(false);

  // Suivi cockpit (admins) : on sonde /me/cockpit/position tant que le modal
  // est ouvert ; 403 (membre) → source cockpit simplement indisponible.
  const [live, setLive] = useState(null);
  const [liveOk, setLiveOk] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const poll = () => {
      api.cockpit.position()
        .then((p) => { if (!alive) return; setLiveOk(true); setLive(p); })
        .catch(() => { if (alive) setLiveOk(false); });
    };
    poll();
    timer.current = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(timer.current); };
  }, [open]);

  const applyPaste = () => {
    const p = parsePositionText(pasted);
    if (!p) { setPasteErr(true); return; }
    const withTs = { ...p, updatedAt: Math.floor(Date.now() / 1000) };
    setManual(withTs);
    setPasteErr(false);
    setPasted('');
    try { localStorage.setItem(POS_KEY, JSON.stringify(withTs)); } catch { /* stockage plein/privé */ }
  };

  // Source affichée : la plus fraîche entre cockpit et collage manuel.
  const pos = useMemo(() => {
    if (live && manual) return (live.updatedAt >= manual.updatedAt ? { ...live, source: 'cockpit' } : { ...manual, source: 'manuel' });
    if (live) return { ...live, source: 'cockpit' };
    if (manual) return { ...manual, source: 'manuel' };
    return null;
  }, [live, manual]);

  const nav = pos && target ? steering(pos, target) : null;

  return (
    <Modal open={open} onClose={onClose} title={`🧭 Boussole — ${target?.label || ''}`} width={480}>
      {target && (
        <p style={{ ...muted, fontSize: 12.5, margin: '0 0 14px' }}>
          Cible : <strong style={{ color: '#ede8f8' }}>{target.label}</strong>
          {target.world ? ` · ${target.world}` : ''} · <span style={{ fontFamily: 'monospace' }}>
            {target.x} {target.y ?? '~'} {target.z}
          </span>
        </p>
      )}

      {!pos ? (
        <p style={{ ...muted, fontSize: 13, margin: '0 0 12px' }}>
          Donne ta position : en jeu, maintiens <strong style={{ color: '#ede8f8' }}>F3 + C</strong> puis
          colle ici — ou lance le suivi cockpit sur ton PC.
        </p>
      ) : (
        <CompassDial nav={nav} pos={pos} target={target} />
      )}

      {/* Saisie / mise à jour manuelle */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <input
          value={pasted}
          onChange={(e) => { setPasted(e.target.value); setPasteErr(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPaste(); } }}
          placeholder="Colle F3+C ici (ou « x y z »)"
          style={{
            flex: 1, background: 'rgba(14,9,28,0.6)',
            border: `1px solid ${pasteErr ? 'rgba(255,100,120,0.55)' : 'rgba(80,50,130,0.28)'}`,
            borderRadius: 8, padding: '9px 11px', color: '#ede8f8',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none',
          }}
        />
        <Button type="button" onClick={applyPaste} disabled={!pasted.trim()}>OK</Button>
      </div>
      {pasteErr && (
        <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 11.5, margin: '6px 0 0' }}>
          Format non reconnu — colle la ligne F3+C telle quelle, ou « 812 62 -1044 ».
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ ...muted, fontSize: 11.5 }}>
          {pos ? (
            <>
              Position {pos.source === 'cockpit' ? '📡 cockpit' : '⌨️ manuelle'}
              {pos.world ? ` · ${pos.world}` : ''} · <span style={{ fontFamily: 'monospace' }}>
                {Math.round(pos.x)} {Math.round(pos.y)} {Math.round(pos.z)}
              </span>
              {pos.updatedAt ? ` · ${fmtAgo(pos.updatedAt)}` : ''}
            </>
          ) : liveOk ? 'Suivi cockpit actif — fais F3+C en jeu, l\'app enverra ta position.' : ''}
        </span>
        {liveOk && <span style={{
          marginLeft: 'auto', fontSize: 10.5, padding: '2px 8px', borderRadius: 10,
          background: 'rgba(123,227,168,0.1)', border: '1px solid rgba(123,227,168,0.4)',
          color: '#7be3a8', fontFamily: "'Inter',sans-serif",
        }}>📡 suivi cockpit connecté</span>}
      </div>
    </Modal>
  );
}

// Cadran : rose des vents fixe (nord en haut) + aiguille vers la cible ; si le
// yaw est connu, un second repère montre le regard et le texte dit le virage.
function CompassDial({ nav, pos }) {
  const size = 170;
  const c = size / 2;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={c} cy={c} r={c - 4} fill="rgba(14,9,28,0.7)" stroke="rgba(120,80,200,0.35)" strokeWidth="2" />
        {['N', 'E', 'S', 'O'].map((l, i) => {
          const a = (i * 90 - 90) * (Math.PI / 180);
          return (
            <text key={l} x={c + Math.cos(a) * (c - 16)} y={c + Math.sin(a) * (c - 16) + 4}
              textAnchor="middle" fill={l === 'N' ? '#e0526f' : 'rgba(180,170,200,0.6)'}
              fontSize="12" fontFamily="'Space Grotesk',sans-serif" fontWeight="700">{l}</text>
          );
        })}
        {/* aiguille cible */}
        <g transform={`rotate(${nav.bearing} ${c} ${c})`}>
          <polygon
            points={`${c},${c - 58} ${c - 9},${c + 8} ${c},${c - 2} ${c + 9},${c + 8}`}
            fill="#e8c86a" stroke="#1a1206" strokeWidth="1"
          />
        </g>
        {/* repère du regard (yaw connu) */}
        {pos.yaw != null && (
          <g transform={`rotate(${yawToCompass(pos.yaw)} ${c} ${c})`}>
            <line x1={c} y1={c - (c - 6)} x2={c} y2={c - (c - 20)} stroke="#7bd3e8" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}
        <circle cx={c} cy={c} r="3.5" fill="#ede8f8" />
      </svg>

      <div style={{ minWidth: 150, fontFamily: "'Inter',sans-serif" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 800, color: '#e8c86a' }}>
          {nav.distance} <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(214,206,232,0.75)' }}>blocs</span>
        </div>
        <div style={{ fontSize: 14, color: '#ede8f8', marginTop: 2 }}>
          {nav.cardinal} <span style={{ ...muted, fontSize: 12 }}>({Math.round(nav.bearing)}°)</span>
        </div>
        {nav.turn != null && (
          <div style={{ fontSize: 13, color: '#7bd3e8', marginTop: 6 }}>
            {Math.abs(nav.turn) < 12
              ? '⬆ tout droit'
              : `${nav.turn < 0 ? '⬅ tourne à gauche' : '➡ tourne à droite'} de ${Math.abs(Math.round(nav.turn))}°`}
          </div>
        )}
        {nav.dy != null && Math.abs(nav.dy) >= 2 && (
          <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>
            {nav.dy > 0 ? `↗ ${nav.dy} blocs plus haut` : `↘ ${-nav.dy} blocs plus bas`}
          </div>
        )}
        {nav.crossWorld && (
          <div style={{
            marginTop: 8, fontSize: 11.5, color: '#fb923c',
            border: '1px solid rgba(251,146,60,0.4)', borderRadius: 8, padding: '4px 8px',
            background: 'rgba(251,146,60,0.08)',
          }}>
            🌋 Mondes différents — coordonnées converties ×8/÷8, passe par un portail.
          </div>
        )}
      </div>
    </div>
  );
}
