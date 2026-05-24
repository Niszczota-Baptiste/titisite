import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { ACC, ACC_RGB } from '../ui';

const RANGES = [
  { days: 7,  label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

const DEVICE_LABELS = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette', bot: 'Robots' };

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

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, gap: 12, flexWrap: 'wrap',
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          Fréquentation
        </h2>
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
        color: 'rgba(180,170,200,0.65)', marginBottom: 18, lineHeight: 1.6,
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
            <Kpi label="Pages vues" value={data.totals.views} />
            <Kpi label="Visiteurs uniques" value={data.totals.visitors} />
          </div>

          <DailyChart series={data.series} />

          <div style={{
            display: 'grid', gap: 16, marginTop: 22,
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}>
            <RankCard title="Pages les plus vues" rows={data.topPaths.map((r) => ({ label: r.path, value: r.views }))} empty="Aucune vue" />
            <RankCard title="Sources de trafic" rows={data.topReferrers.map((r) => ({ label: r.referrer, value: r.views }))} empty="Aucun référent externe" />
            <RankCard title="Appareils" rows={data.devices.map((r) => ({ label: DEVICE_LABELS[r.device] || r.device, value: r.views }))} empty="Aucune donnée" />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={{
      flex: '1 1 160px',
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 700,
        color: ACC, letterSpacing: '-0.5px', lineHeight: 1,
      }}>
        {Number(value).toLocaleString('fr-FR')}
      </div>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontSize: 11.5, marginTop: 6,
        color: 'rgba(180,170,200,0.7)', letterSpacing: '0.5px',
        textTransform: 'uppercase', fontWeight: 600,
      }}>{label}</div>
    </div>
  );
}

function DailyChart({ series }) {
  const max = series.reduce((m, d) => Math.max(m, d.views), 0) || 1;
  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 12, padding: '18px 18px 12px',
    }}>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
        color: '#ede8f8', marginBottom: 14,
      }}>Pages vues par jour</div>
      {series.length === 0 ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>
          Aucune donnée sur la période.
        </p>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 3,
          height: 140, overflowX: 'auto',
        }}>
          {series.map((d) => (
            <div
              key={d.day}
              title={`${d.day} · ${d.views} vues · ${d.visitors} visiteurs`}
              style={{
                flex: '1 0 6px', minWidth: 6,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                height: '100%',
              }}
            >
              <div style={{
                height: `${Math.max(2, (d.views / max) * 100)}%`,
                background: `rgba(${ACC_RGB},0.55)`,
                border: `1px solid rgba(${ACC_RGB},0.8)`,
                borderRadius: '3px 3px 0 0',
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RankCard({ title, rows, empty }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
        color: '#ede8f8', marginBottom: 12,
      }}>{title}</div>
      {rows.length === 0 ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 12.5 }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', gap: 8,
                fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                color: 'rgba(232,228,248,0.85)', marginBottom: 3,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span style={{ color: 'rgba(180,170,200,0.7)', flexShrink: 0 }}>{r.value}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(60,40,100,0.35)' }}>
                <div style={{
                  width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: 3,
                  background: `rgba(${ACC_RGB},0.65)`,
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
