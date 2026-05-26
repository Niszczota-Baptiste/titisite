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

const KEYFRAMES = `
@keyframes an-fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@keyframes an-grow   { from { transform:scaleY(0); } to { transform:scaleY(1); } }
@keyframes an-blink  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
`;

export function AnalyticsEditor() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    api.analytics.summary(days)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [days]);

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

          {/* ── Countries ── */}
          {data.countries.length > 0 && (
            <Card title="🌍 Pays" style={{ marginBottom: 18 }}>
              <div style={{
                display: 'grid', gap: '12px 22px',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              }}>
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
            <RankCard
              title="Appareils"
              empty="Aucune donnée"
              rows={data.devices.map((r) => ({
                value: r.views,
                label: `${DEVICE_ICONS[r.device] || '•'} ${DEVICE_LABELS[r.device] || r.device}`,
              }))}
            />
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
