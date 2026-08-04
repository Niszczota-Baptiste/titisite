import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';
import { ACC, ACC_RGB, Button } from '../ui';

// Onglet « 🖥 Serveur » : état de la machine qui héberge le site.
//
// Tout vient de l'OS via GET /api/system/stats — le process Node tourne SUR le
// VPS, il lit donc son propre disque, sa RAM et son CPU. Aucun service tiers,
// aucune clé d'API : ça marcherait à l'identique chez n'importe quel hébergeur.
//
// Deux cadences volontairement différentes : les jauges live (disque, RAM, CPU)
// se rafraîchissent toutes les 5 s, tandis que le détail « ce que le site
// occupe » vient d'un parcours de disque mémoïsé côté serveur (5 min) — le
// rafraîchissement auto ne doit pas reparcourir 18 000 fichiers en boucle.

const REFRESH_MS = 5000;
const HISTORY = 60; // points gardés pour les courbes (≈ 5 min à 5 s)

const OK = '#9ad4ae';
const WARN = '#e8c86a';
const CRIT = '#e8788f';
const MUTED = 'rgba(180,170,200,0.7)';
const DIM = 'rgba(180,170,200,0.45)';

// Seuils d'alerte : en dessous de 70 % tout va bien, au-delà de 85 % il faut
// agir (un disque plein casse les uploads ET les écritures SQLite).
const severity = (pct) => (pct >= 85 ? CRIT : (pct >= 70 ? WARN : OK));

// Unités binaires (Kio/Mio/Gio) — celles que rapportent `df` et le noyau. Les
// afficher en Go décimaux ferait un écart de 7 % avec ce que dit le serveur.
function fmtBytes(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} o`;
  const units = ['Kio', 'Mio', 'Gio', 'Tio'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 ? 0 : (v >= 10 ? 1 : 2))} ${units[i]}`;
}

function fmtDuration(sec) {
  if (sec === null || sec === undefined) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  // Sous la minute, afficher « 0 min » ferait croire à une erreur juste après
  // un redémarrage — c'est justement le moment où on regarde cette page.
  if (m < 1) return `${Math.round(sec)} s`;
  return `${m} min`;
}

const fmtPct = (p) => (p === null || p === undefined ? '—' : `${p.toFixed(p >= 10 ? 0 : 1)} %`);

export function SystemEditor() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // poste déplié dans « ce que ça occupe »
  // Historique de session pour les courbes : rien n'est stocké côté serveur,
  // ces points vivent le temps de l'onglet.
  const [history, setHistory] = useState([]);
  const alive = useRef(true);

  const load = useCallback(async ({ rescan = false } = {}) => {
    if (rescan) setBusy(true);
    try {
      const s = await api.system.stats({ rescan });
      if (!alive.current) return;
      setData(s);
      setErr(null);
      setHistory((h) => [...h, { cpu: s.cpu.usagePct, mem: memPct(s.memory), at: s.at }].slice(-HISTORY));
    } catch (e) {
      if (alive.current) setErr(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // Rafraîchissement auto, suspendu quand l'onglet du navigateur est caché :
  // inutile de réveiller le VPS toutes les 5 s pour une page que personne ne
  // regarde.
  useEffect(() => {
    if (!auto) return undefined;
    let timer = null;
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [auto, load]);

  if (err && !data) {
    return (
      <div style={{ ...card, borderColor: 'rgba(232,120,143,0.4)', color: CRIT }}>
        Impossible de lire l’état du serveur : {err}
      </div>
    );
  }
  if (!data) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Lecture de la machine…</p>;

  const { cpu, memory, disks, app, host, process: proc } = data;
  const memoryPct = memPct(memory);
  // Le volume le plus rempli mène la danse : c'est celui qui cassera en premier.
  const worstDisk = disks.reduce((a, d) => (a && a.usedPct > d.usedPct ? a : d), null);

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: auto ? OK : DIM,
              boxShadow: auto ? `0 0 10px ${OK}` : 'none',
            }} />
            <span style={{
              fontFamily: 'monospace', fontSize: 10, color: MUTED,
              letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600,
            }}>
              {host.hostname} · {host.platform}/{host.arch} · {host.env}
            </span>
          </div>
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 800,
            color: '#ede8f8', letterSpacing: '-0.6px',
          }}>Serveur</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button" onClick={() => setAuto((v) => !v)}
            title={auto ? `Rafraîchissement toutes les ${REFRESH_MS / 1000} s` : 'Rafraîchissement suspendu'}
            style={{
              padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              fontFamily: "'Inter',sans-serif",
              color: auto ? '#08051a' : MUTED, background: auto ? OK : 'transparent',
              border: `1px solid ${auto ? OK : 'rgba(80,50,130,0.4)'}`,
            }}
          >{auto ? '● Live' : '❚❚ En pause'}</button>
          <Button type="button" variant="ghost" onClick={() => load({ rescan: true })} disabled={busy}
            style={{ padding: '7px 13px', fontSize: 12.5 }}>
            {busy ? 'Analyse…' : '↻ Rescanner le disque'}
          </Button>
        </div>
      </div>

      {err && (
        <div style={{ ...card, borderColor: 'rgba(232,120,143,0.4)', color: CRIT, marginBottom: 14, padding: '10px 14px', fontSize: 13 }}>
          Dernier relevé en échec ({err}) — les chiffres ci-dessous datent de la mesure précédente.
        </div>
      )}

      {/* Les quatre chiffres qui répondent à « est-ce que ça va ? » */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
        <Stat
          label="Disque utilisé" value={fmtPct(worstDisk?.usedPct)} accent={severity(worstDisk?.usedPct ?? 0)}
          sub={worstDisk ? `${fmtBytes(worstDisk.available)} libres sur ${fmtBytes(worstDisk.total)}` : '—'}
        />
        <Stat
          label="Mémoire" value={fmtPct(memoryPct)} accent={severity(memoryPct)}
          sub={`${fmtBytes(memory.available)} disponibles sur ${fmtBytes(memory.total)}`}
          spark={history.map((h) => h.mem)}
        />
        <Stat
          label="Processeur" value={fmtPct(cpu.usagePct)} accent={severity(cpu.usagePct ?? 0)}
          sub={`${cpu.cores} cœur${cpu.cores > 1 ? 's' : ''}${cpu.quotaCores ? ` · quota ${cpu.quotaCores}` : ''} · charge ${cpu.loadavg[0].toFixed(2)}`}
          spark={history.map((h) => h.cpu)}
        />
        <Stat
          label="Machine allumée depuis" value={fmtDuration(host.uptimeSec)} accent={ACC}
          sub={`site en ligne depuis ${fmtDuration(proc.uptimeSec)}`}
        />
      </div>

      {/* Stockage : la question posée. Une jauge par volume. */}
      <Card title="Stockage">
        {disks.map((d) => (
          <div key={d.paths[0]} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 7 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: '#ede8f8', fontWeight: 600 }}>
                {d.labels.join(' · ')}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: severity(d.usedPct) }}>
                {fmtBytes(d.used)} / {fmtBytes(d.total)} — {fmtPct(d.usedPct)}
              </span>
            </div>
            <Bar pct={d.usedPct} color={severity(d.usedPct)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: DIM }}>{d.paths.join('  ·  ')}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: MUTED }}>
                <strong style={{ color: OK }}>{fmtBytes(d.available)}</strong> écrivables
                {d.reserved > 0 && (
                  <span title={'Espace que le noyau compte comme libre mais que le site ne peut pas utiliser : '
                    + 'la réserve root du système de fichiers (~5 % sur ext4), ou un quota si la machine est virtualisée.'}>
                    {' '}· {fmtBytes(d.reserved)} hors d’atteinte
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
      </Card>

      {/* Ce que le site occupe : la réponse à « qu'est-ce qui remplit mon disque ». */}
      <Card
        title="Ce que le site occupe"
        aside={`${fmtBytes(app.total)} au total · mesuré ${relative(app.scannedAt)}`}
        style={{ marginTop: 14 }}
      >
        {app.items.map((it) => {
          const share = app.total > 0 ? (it.bytes / app.total) * 100 : 0;
          const expandable = it.children?.length > 0 || it.detail;
          return (
            <div key={it.key} style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => expandable && setOpen((o) => (o === it.key ? null : it.key))}
                style={{
                  width: '100%', background: 'none', border: 'none', padding: 0,
                  cursor: expandable ? 'pointer' : 'default', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: 10, flexWrap: 'wrap', marginBottom: 6,
                }}
              >
                <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ede8f8' }}>
                  {expandable && <span style={{ color: DIM, marginRight: 5 }}>{open === it.key ? '▾' : '▸'}</span>}
                  {it.label}
                  {it.files > 0 && <span style={{ color: DIM, fontSize: 11.5 }}> · {it.files.toLocaleString('fr-FR')} fichiers</span>}
                  {it.truncated && (
                    <span style={{ color: WARN, fontSize: 11 }} title="Trop de fichiers pour être tous parcourus : ce total est partiel.">
                      {' '}⚠ partiel
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: ACC }}>{fmtBytes(it.bytes)}</span>
              </button>
              <Bar pct={share} color={`rgba(${ACC_RGB},0.75)`} height={5} />
              {open === it.key && (
                <div style={{ marginTop: 8, paddingLeft: 16, borderLeft: '1px solid rgba(80,50,130,0.3)' }}>
                  {it.children?.map((c) => (
                    <Line key={c.name} name={`${c.name}/`} bytes={c.bytes} note={`${c.files.toLocaleString('fr-FR')} fichiers`} />
                  ))}
                  {it.detail && Object.entries(it.detail).map(([k, v]) => (
                    <Line key={k} name={k === 'sqlite' ? 'data.sqlite' : `data.sqlite-${k}`} bytes={v} />
                  ))}
                  {!it.children?.length && !it.detail && (
                    <span style={{ color: DIM, fontSize: 12 }}>Aucun sous-dossier.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 14 }}>
        <Card title="Mémoire">
          <Bar pct={memoryPct} color={severity(memoryPct)} />
          <dl style={{ margin: '12px 0 0' }}>
            <Row k="Totale" v={fmtBytes(memory.total)} />
            <Row k="Disponible" v={fmtBytes(memory.available)}
              note={memory.availableExact === false ? 'estimée (noyau ancien)' : null} />
            {memory.cached != null && <Row k="Cache disque" v={fmtBytes(memory.cached)} note="récupérable à la demande" />}
            {memory.swapTotal > 0 && (
              <Row k="Swap" v={`${fmtBytes(memory.swapTotal - memory.swapFree)} / ${fmtBytes(memory.swapTotal)}`} />
            )}
            <Row k="Site (Node)" v={fmtBytes(proc.rss)} note={`tas ${fmtBytes(proc.heapUsed)}`} />
            {memory.limited && <Row k="Plafond" v="limite de conteneur" note={memory.source} />}
          </dl>
        </Card>

        <Card title="Processeur">
          <Bar pct={cpu.usagePct ?? 0} color={severity(cpu.usagePct ?? 0)} />
          <dl style={{ margin: '12px 0 0' }}>
            <Row k="Modèle" v={cpu.model || '—'} />
            <Row k="Cœurs" v={`${cpu.cores}${cpu.speedMhz ? ` · ${cpu.speedMhz} MHz` : ''}`} />
            <Row
              k="Charge 1 / 5 / 15 min"
              v={cpu.loadavg.map((l) => l.toFixed(2)).join('  ')}
              note={cpu.loadPerCore
                ? `${(cpu.loadPerCore[0] * 100).toFixed(0)} % par cœur — au-delà de 100 %, la machine est saturée`
                : null}
            />
            <Row k="Mesuré sur" v={`${(cpu.usageWindowMs / 1000).toFixed(1)} s`} />
            {cpu.quotaCores && <Row k="Quota conteneur" v={`${cpu.quotaCores} cœur(s)`} />}
          </dl>
        </Card>

        <Card title="Système">
          <dl style={{ margin: 0 }}>
            <Row k="Hôte" v={host.hostname} />
            <Row k="Noyau" v={`${host.platform} ${host.release}`} />
            <Row k="Node" v={host.nodeVersion} />
            <Row k="Mode" v={host.env} />
            <Row k="Allumée depuis" v={fmtDuration(host.uptimeSec)} />
            <Row k="Site relancé il y a" v={fmtDuration(proc.uptimeSec)} note={`pid ${proc.pid}`} />
          </dl>
        </Card>
      </div>

      <p style={{ color: DIM, fontFamily: "'Inter',sans-serif", fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
        Mesures lues directement sur la machine par le serveur du site — aucun service externe, aucune
        clé d’API. « Disponible » suit la convention de <code>df</code> et de <code>MemAvailable</code> :
        c’est ce que le site peut réellement utiliser, réserve système et cache disque déduits.
      </p>
    </div>
  );
}

const memPct = (m) => (m.total > 0 ? ((m.total - m.available) / m.total) * 100 : 0);

// « il y a 12 s » — la mesure disque étant mémoïsée, il faut dire de quand elle
// date, sinon on croirait qu'elle suit les jauges live.
function relative(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.round(s / 60)} min`;
}

function Bar({ pct, color, height = 9 }) {
  const w = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{
      height, borderRadius: height, background: 'rgba(80,50,130,0.22)', overflow: 'hidden',
    }}>
      <div style={{
        width: `${w}%`, height: '100%', background: color, borderRadius: height,
        transition: 'width 0.4s ease, background 0.4s ease',
      }} />
    </div>
  );
}

// Courbe de session : purement visuelle, normalisée sur 0–100 %.
function Spark({ points, color }) {
  if (!points || points.length < 2) return null;
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, p ?? 0));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="26" aria-hidden
      style={{ display: 'block', marginTop: 8, opacity: 0.85 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, value, sub, accent, spark }) {
  return (
    <div style={{ ...card, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg,${accent},transparent)`, opacity: 0.7,
      }} />
      <div style={{
        fontFamily: "'Inter',sans-serif", fontSize: 10.5, color: MUTED,
        letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 800,
        color: accent, letterSpacing: '-1px', lineHeight: 1,
      }}>{value}</div>
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED, marginTop: 6 }}>{sub}</div>
      <Spark points={spark} color={accent} />
    </div>
  );
}

function Card({ title, aside, children, style }) {
  return (
    <div style={{ ...card, ...style }}>
      {(title || aside) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          gap: 10, flexWrap: 'wrap', marginBottom: 14,
        }}>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600, color: '#ede8f8' }}>
            {title}
          </span>
          {aside && <span style={{ fontFamily: 'monospace', fontSize: 11, color: DIM }}>{aside}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({ k, v, note }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 12, padding: '5px 0', borderTop: '1px solid rgba(80,50,130,0.16)',
    }}>
      <dt style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED, flex: '0 0 auto' }}>{k}</dt>
      <dd style={{ margin: 0, textAlign: 'right', minWidth: 0 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ede8f8', wordBreak: 'break-word' }}>{v}</span>
        {note && <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10.5, color: DIM }}>{note}</div>}
      </dd>
    </div>
  );
}

function Line({ name, bytes, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: MUTED }}>
        {name}{note && <span style={{ color: DIM }}> · {note}</span>}
      </span>
      <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#ede8f8' }}>{fmtBytes(bytes)}</span>
    </div>
  );
}

const card = {
  background: 'rgba(14,9,28,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 14,
  padding: '18px 20px',
};
