import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { ACC, ACC_RGB } from '../ui';

const RANGES = [
  { days: 7,  label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

const DEVICE_LABELS = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette', bot: 'Robots' };
const DEVICE_ICONS = { desktop: '💻', mobile: '📱', tablet: '▭', bot: '🤖' };

const EVENT_LABELS = {
  link_click:     { name: 'Clics sur les liens', empty: 'Aucun clic', icon: '↗', accent: '#c9a8e8' },
  track_play:     { name: 'Écoutes de musique', empty: 'Aucune écoute', icon: '♪', accent: '#9ad4ae' },
  project_view:   { name: 'Projets consultés', empty: 'Aucune consultation', icon: '◇', accent: '#7eb8f7' },
  contact_submit: { name: 'Contacts (mail / formulaire)', empty: 'Aucun envoi', icon: '✉', accent: '#e8a87c' },
};

const SEARCH_ENGINES = /google|bing|duckduckgo|qwant|ecosia|yahoo|yandex|baidu|brave|startpage/i;
const SOURCE_META = {
  search:   { label: 'Recherche',   color: '#e8a87c' },
  referral: { label: 'Lien externe', color: '#7eb8f7' },
};
const sourceType = (host) => (SEARCH_ENGINES.test(host) ? 'search' : 'referral');

// 2-letter ISO code → flag emoji (regional indicator symbols).
function flagEmoji(cc) {
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳';
  return cc.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

let _regionNames;
function countryName(cc) {
  try {
    if (!_regionNames) _regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
    return _regionNames.of(cc) || cc;
  } catch {
    return cc;
  }
}

// Approximate country centroids [lat, lon] for the connection map. Countries
// outside this list still appear in the "Pays" list, just without a map dot.
const COUNTRY_CENTROIDS = {
  FR: [46.2, 2.2], BE: [50.5, 4.5], KR: [36.5, 127.8], CA: [56.1, -106.3],
  US: [39.8, -98.6], GB: [54.4, -3.4], DE: [51.2, 10.5], ES: [40.5, -3.7],
  IT: [41.9, 12.6], NL: [52.1, 5.3], CH: [46.8, 8.2], PT: [39.4, -8.2],
  IE: [53.4, -8.2], LU: [49.8, 6.1], AT: [47.5, 14.6], PL: [51.9, 19.1],
  SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5], FI: [61.9, 25.7],
  CZ: [49.8, 15.5], SK: [48.7, 19.7], SI: [46.1, 15.0], HR: [45.1, 15.2],
  RS: [44.0, 21.0], BG: [42.7, 25.5], RO: [45.9, 25.0], HU: [47.2, 19.5],
  GR: [39.1, 21.8], TR: [39.0, 35.2], UA: [48.4, 31.2], RU: [61.5, 105.3],
  LT: [55.2, 23.9], LV: [56.9, 24.6], EE: [58.6, 25.0], IS: [65.0, -19.0],
  CN: [35.9, 104.2], JP: [36.2, 138.3], IN: [20.6, 79.0], ID: [-0.8, 113.9],
  SG: [1.35, 103.8], MY: [4.2, 102.0], TH: [15.9, 101.0], VN: [14.1, 108.3],
  PH: [12.9, 121.8], HK: [22.4, 114.1], TW: [23.7, 121.0], PK: [30.4, 69.3],
  BD: [23.7, 90.4], IL: [31.0, 34.9], AE: [23.4, 53.8], SA: [23.9, 45.1],
  QA: [25.4, 51.2], LB: [33.9, 35.9], AU: [-25.3, 133.8], NZ: [-40.9, 174.9],
  BR: [-14.2, -51.9], AR: [-38.4, -63.6], MX: [23.6, -102.6], CL: [-35.7, -71.5],
  CO: [4.6, -74.3], PE: [-9.2, -75.0], ZA: [-30.6, 22.9], EG: [26.8, 30.8],
  MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5], NG: [9.1, 8.7],
  KE: [0.0, 37.9],
};

// Hand-simplified continent outlines for the map backdrop (equirectangular,
// viewBox 0 0 800 360). Decorative only.
const CONTINENTS = "M158,98 L182,92 L210,95 L230,108 L250,115 L268,128 L255,138 L240,142 L218,148 L200,152 L185,155 L168,150 L155,142 L150,128 L155,112 Z M280,108 L320,102 L360,108 L395,118 L420,128 L440,140 L455,158 L460,178 L450,195 L430,205 L408,210 L388,208 L370,200 L355,188 L342,175 L330,165 L315,152 L298,140 L285,125 Z M120,165 L138,155 L155,158 L168,168 L172,182 L165,195 L150,200 L132,198 L118,188 L112,175 Z M450,260 L478,255 L500,262 L515,275 L520,290 L510,302 L490,308 L470,305 L452,295 L445,280 Z M195,205 L215,200 L232,208 L240,222 L235,238 L218,245 L200,242 L188,232 L185,218 Z M540,150 L575,148 L605,155 L630,168 L645,182 L640,198 L620,205 L595,208 L575,205 L555,195 L545,182 L538,170 Z";

const KEYFRAMES = `
@keyframes an-fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@keyframes an-grow   { from { transform:scaleY(0); } to { transform:scaleY(1); } }
@keyframes an-blink  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
`;

export function AnalyticsEditor() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);
  const [loadedAt, setLoadedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    api.analytics.summary(days)
      .then((r) => { if (alive) { setData(r); setLoadedAt(new Date()); } })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [days, tick]);

  const totals = data?.totals;
  const prevViews = data?.prev?.views || 0;
  const trend = totals ? totals.views - prevViews : 0;
  const trendPct = prevViews ? Math.round((trend / prevViews) * 100) : null;
  const sparkData = data ? data.series.slice(-7).map((d) => d.views) : [];
  const viewsPerVisitor = totals && totals.visitors
    ? (totals.views / totals.visitors).toFixed(1) : '—';
  const countriesWithData = data ? data.countries.length : 0;

  return (
    <div>
      <style>{KEYFRAMES}</style>

      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 8, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#9ad4ae',
              boxShadow: '0 0 10px rgba(154,212,174,0.7)', animation: 'an-blink 1.6s ease-in-out infinite',
            }} />
            <span style={{
              fontFamily: 'monospace', fontSize: 10, color: 'rgba(154,212,174,0.75)',
              letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600,
            }}>live · stats anonymes</span>
          </div>
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 800,
            color: '#ede8f8', letterSpacing: '-0.6px',
          }}>
            Fréquentation
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              style={{
                background: days === r.days ? `rgba(${ACC_RGB},0.16)` : 'transparent',
                border: `1px solid ${days === r.days ? ACC : 'rgba(80,50,130,0.28)'}`,
                color: days === r.days ? ACC : 'rgba(232,228,248,0.7)',
                borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                fontWeight: days === r.days ? 700 : 500,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p style={{
        fontFamily: "'Inter',sans-serif", fontSize: 13,
        color: 'rgba(180,170,200,0.65)', marginBottom: 18, lineHeight: 1.6, maxWidth: 620,
      }}>
        Statistiques anonymes des pages publiques : aucun cookie, aucune IP
        stockée. Les visiteurs uniques sont comptés via une empreinte qui change
        chaque jour.
      </p>

      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 13,
        }}>{err}</div>
      )}

      {data === null && !err ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : data && (
        <>
          {/* ── Stat cards ── */}
          <div style={{
            display: 'grid', gap: 12, marginBottom: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          }}>
            <StatCard
              value={totals.views} label="Pages vues" delay={0}
              spark={<Sparkline data={sparkData} />}
              sub={trendPct === null
                ? '— période préc. vide'
                : `${trend > 0 ? '↑' : trend < 0 ? '↓' : '—'} ${Math.abs(trendPct)}% vs ${days} j préc.`}
            />
            <StatCard value={totals.visitors} label="Visiteurs uniques" delay={0.05} icon="👥" />
            <StatCard value={countriesWithData} label="Pays" delay={0.1} accent="#9ad4ae" icon="🌍" />
            <StatCard value={viewsPerVisitor} label="Vues / visiteur" delay={0.15} accent="#e8a87c" />
          </div>

          {/* ── Daily chart ── */}
          <Card title="Pages vues par jour" style={{ marginBottom: 18 }}>
            <DailyChart series={data.series} />
          </Card>

          {/* ── Map + Countries ── */}
          {data.countries.length > 0 && (
            <div style={{
              display: 'grid', gap: 16, marginBottom: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}>
              <Card title="🌍 Carte des connexions" style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <WorldMap countries={data.countries} />
              </Card>
              <Card title="Pays">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.countries.map((c, i) => (
                    <BarRow
                      key={c.country}
                      label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{flagEmoji(c.country)}</span>
                        {countryName(c.country)}
                        <span style={{
                          fontFamily: 'monospace', fontSize: 9, color: 'rgba(180,170,200,0.6)',
                          background: `rgba(${ACC_RGB},0.12)`, padding: '1px 5px', borderRadius: 3,
                        }}>{c.country}</span>
                      </span>}
                      value={c.visitors}
                      max={Math.max(...data.countries.map((x) => x.visitors), 1)}
                      delay={i * 0.04}
                    />
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── Pages / Sources / Devices ── */}
          <div style={{
            display: 'grid', gap: 16, marginBottom: 4,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            <RankCard
              title="Pages les plus vues"
              rows={data.topPaths.map((r) => ({ label: r.path, value: r.views, mono: true }))}
              empty="Aucune vue"
            />
            <RankCard
              title="Sources de trafic"
              empty="Aucun référent externe"
              rows={data.topReferrers.map((r) => {
                const meta = SOURCE_META[sourceType(r.referrer)];
                return {
                  value: r.views, mono: true,
                  color: meta.color,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referrer}</span>
                      <span style={{
                        fontSize: 9, color: meta.color, border: `1px solid ${meta.color}44`,
                        background: `${meta.color}14`, padding: '1px 6px', borderRadius: 10, flexShrink: 0,
                      }}>{meta.label}</span>
                    </span>
                  ),
                };
              })}
            />
            <Card title="Appareils & navigateurs">
              {data.devices.length === 0 ? (
                <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 12.5 }}>Aucune donnée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data.devices.map((r, i) => (
                    <BarRow
                      key={r.device}
                      label={`${DEVICE_ICONS[r.device] || '•'} ${DEVICE_LABELS[r.device] || r.device}`}
                      value={r.views}
                      max={Math.max(...data.devices.map((x) => x.views), 1)}
                      delay={i * 0.04}
                    />
                  ))}
                </div>
              )}
              {data.browsers?.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(60,40,100,0.25)' }}>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 10, color: 'rgba(180,170,200,0.55)',
                    letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12,
                  }}>Navigateurs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.browsers.map((b, i) => (
                      <BarRow
                        key={b.browser}
                        label={b.browser}
                        value={b.views}
                        max={Math.max(...data.browsers.map((x) => x.views), 1)}
                        color="#7eb8f7"
                        delay={i * 0.04}
                      />
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── Interactions ── */}
          {data.events?.length > 0 && (
            <>
              <h3 style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700,
                color: '#ede8f8', margin: '30px 0 14px',
                borderLeft: `3px solid rgba(${ACC_RGB},0.45)`, paddingLeft: 12,
              }}>
                Interactions
              </h3>
              <div style={{
                display: 'grid', gap: 12, marginBottom: 18,
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              }}>
                {data.events.map((ev, i) => {
                  const meta = EVENT_LABELS[ev.name] || { name: ev.name, accent: ACC };
                  return (
                    <StatCard
                      key={ev.name}
                      value={ev.total}
                      label={meta.name}
                      accent={meta.accent}
                      icon={meta.icon}
                      delay={i * 0.05}
                    />
                  );
                })}
              </div>
              <div style={{
                display: 'grid', gap: 16,
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              }}>
                {data.events.filter((ev) => ev.labels.length > 0).map((ev) => {
                  const meta = EVENT_LABELS[ev.name] || { name: ev.name, empty: '—', icon: '•', accent: ACC };
                  return (
                    <RankCard
                      key={ev.name}
                      title={`${meta.icon} ${meta.name}`}
                      color={meta.accent}
                      rows={ev.labels.map((l) => ({ label: l.label, value: l.count }))}
                      empty={meta.empty}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* ── Footer ── */}
          <div style={{
            marginTop: 36, paddingTop: 20, borderTop: '1px solid rgba(60,40,100,0.18)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(180,170,200,0.4)' }}>
              {loadedAt && `dernière mise à jour · ${loadedAt.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <button
              onClick={() => setTick((t) => t + 1)}
              style={{
                background: `rgba(${ACC_RGB},0.14)`, border: `1px solid rgba(${ACC_RGB},0.35)`,
                color: ACC, borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              ⟳ Actualiser
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, children, style }) {
  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 14, padding: '18px 20px', ...style,
    }}>
      {title && (
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
          color: '#ede8f8', marginBottom: 14,
        }}>{title}</div>
      )}
      {children}
    </div>
  );
}

function StatCard({ value, label, sub, accent = ACC, delay = 0, spark, icon }) {
  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 14, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
      animation: `an-fadeUp 0.5s ease ${delay}s both`,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg,${accent},transparent)`, opacity: 0.6,
      }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 800,
          color: accent, letterSpacing: '-1px', lineHeight: 1,
        }}>
          {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
        </div>
        {icon && <span style={{ fontSize: 15, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{
        fontFamily: 'monospace', fontSize: 10, color: 'rgba(180,170,200,0.7)',
        letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 600, marginTop: 8,
      }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(180,170,200,0.5)', marginTop: 4 }}>{sub}</div>}
      {spark && <div style={{ marginTop: 10 }}>{spark}</div>}
    </div>
  );
}

function Sparkline({ data, color = ACC }) {
  const max = Math.max(1, ...data);
  if (data.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 18 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${(v / max) * 100}%`, minHeight: 1,
          background: color, opacity: 0.4 + 0.6 * (v / max),
          borderRadius: '1px 1px 0 0',
        }} />
      ))}
    </div>
  );
}

function DailyChart({ series }) {
  const [hover, setHover] = useState(null);
  const max = series.reduce((m, d) => Math.max(m, d.views), 0) || 1;

  if (series.length === 0) {
    return (
      <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
        Aucune donnée sur la période.
      </p>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 3, height: 140,
        marginBottom: 10, position: 'relative',
      }}>
        {series.map((d, i) => {
          const h = d.views === 0 ? 0 : (d.views / max) * 100;
          const isHov = hover === i;
          return (
            <div
              key={d.day}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                flex: '1 0 5px', minWidth: 5, height: '100%',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                cursor: 'pointer', position: 'relative',
              }}
            >
              <div style={{
                height: `${h}%`, minHeight: d.views ? 2 : 0,
                background: isHov ? ACC : `rgba(${ACC_RGB},0.5)`,
                border: `1px solid rgba(${ACC_RGB},${isHov ? 1 : 0.7})`,
                borderRadius: '3px 3px 0 0',
                boxShadow: isHov ? `0 0 12px rgba(${ACC_RGB},0.5)` : 'none',
                transformOrigin: 'bottom',
                animation: `an-grow 0.6s cubic-bezier(.22,1,.36,1) ${i * 0.012}s both`,
                transition: 'background 0.15s, box-shadow 0.15s',
              }} />
              {isHov && (
                <div style={{
                  position: 'absolute', bottom: `${h}%`, left: '50%',
                  transform: 'translate(-50%,-8px)', zIndex: 10,
                  background: 'rgba(8,5,20,0.97)', border: `1px solid rgba(${ACC_RGB},0.4)`,
                  borderRadius: 6, padding: '5px 10px', whiteSpace: 'nowrap',
                  fontFamily: 'monospace', fontSize: 11, color: '#ede8f8', pointerEvents: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  {d.day} · <span style={{ color: ACC }}>{d.views} vues</span> · {d.visitors} vis.
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'monospace', fontSize: 10, color: 'rgba(180,170,200,0.45)',
      }}>
        <span>{series[0].day}</span>
        {series.length > 2 && <span>{series[Math.floor(series.length / 2)].day}</span>}
        <span>{series[series.length - 1].day}</span>
      </div>
    </div>
  );
}

function RankCard({ title, rows, empty, color = ACC }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 12.5 }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r, i) => (
            <BarRow
              key={i}
              label={r.label}
              value={r.value}
              max={Math.max(...rows.map((x) => x.value), 1)}
              color={r.color || color}
              mono={r.mono}
              delay={i * 0.04}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function WorldMap({ countries }) {
  const proj = (lat, lon) => ({ x: (lon + 180) * (800 / 360), y: (90 - lat) * (360 / 180) });
  const plotted = countries.filter((c) => COUNTRY_CENTROIDS[c.country]);
  const maxV = Math.max(...countries.map((c) => c.visitors), 1);
  const totalVisitors = countries.reduce((s, c) => s + c.visitors, 0);

  return (
    <div style={{
      position: 'relative', background: 'rgba(6,3,16,0.6)', borderRadius: 10,
      padding: 16, overflow: 'hidden', border: '1px solid rgba(60,40,100,0.2)',
    }}>
      <svg viewBox="0 0 800 360" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <radialGradient id="an-cityGlow">
            <stop offset="0%" stopColor={`rgba(${ACC_RGB},0.7)`} />
            <stop offset="100%" stopColor={`rgba(${ACC_RGB},0)`} />
          </radialGradient>
          <pattern id="an-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0 L0 0 0 40" fill="none" stroke="rgba(80,50,130,0.08)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="800" height="360" fill="url(#an-grid)" />
        <path d={CONTINENTS} fill="rgba(80,50,130,0.18)" stroke="rgba(120,80,200,0.25)" strokeWidth="0.6" />
        {plotted.map((c, i) => {
          const [lat, lon] = COUNTRY_CENTROIDS[c.country];
          const { x, y } = proj(lat, lon);
          const r = 4 + (c.visitors / maxV) * 8;
          return (
            <g key={c.country}>
              <circle cx={x} cy={y} r={r * 3} fill="url(#an-cityGlow)" />
              <circle cx={x} cy={y} r={r} fill="none" stroke={ACC} strokeWidth="1.5" opacity="0.6">
                <animate attributeName="r" from={r} to={r * 3} dur="2.5s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2.5s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r={r} fill={ACC} stroke="#050511" strokeWidth="1" />
              <text x={x + r + 5} y={y + 3} fontSize="9" fill={`rgba(${ACC_RGB},0.65)`} fontFamily="monospace">
                {countryName(c.country)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute', bottom: 14, left: 14, display: 'flex', alignItems: 'center', gap: 7,
        background: 'rgba(10,6,22,0.85)', border: '1px solid rgba(80,50,130,0.3)',
        borderRadius: 20, padding: '4px 11px',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: ACC,
          boxShadow: `0 0 8px rgba(${ACC_RGB},0.8)`, animation: 'an-blink 1.5s ease-in-out infinite',
        }} />
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: `rgba(${ACC_RGB},0.75)` }}>
          {totalVisitors} visiteur{totalVisitors > 1 ? 's' : ''} · {plotted.length} pays
        </span>
      </div>
    </div>
  );
}

function BarRow({ label, value, max, color = ACC, mono, delay = 0 }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div style={{ animation: `an-fadeUp 0.4s ease ${delay}s both` }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 8, marginBottom: 5,
      }}>
        <span style={{
          fontFamily: mono ? 'monospace' : "'Inter',sans-serif",
          fontSize: mono ? 12 : 13, color: mono ? color : 'rgba(232,228,248,0.88)',
          fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 700,
          color: '#ede8f8', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'rgba(60,40,100,0.35)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg,${color},${color}aa)`,
          boxShadow: `0 0 8px ${color}40`,
          transition: 'width 0.6s cubic-bezier(.22,1,.36,1)',
        }} />
      </div>
    </div>
  );
}
