import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Login } from '../components/admin/Login';
import { ACC, ACC_RGB, Button, Field, Input, Textarea } from '../components/admin/ui';
import { useConfirm } from '../ui/ConfirmProvider';
import { useIsMobile } from '../hooks/useIsMobile';

const EVEN_COLOR = '#7be3a8';   // pair
const ODD_COLOR  = '#e89bd1';   // impair
const BIG_RING   = '#ffd166';   // grandes marches accent

export default function Stairs() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={fullScreen}>
        <p style={muted}>Chargement…</p>
      </div>
    );
  }
  if (!user) {
    return <Login title="Escaliers" subtitle="Connecte-toi pour accéder à la section." />;
  }
  if (!user.canViewStairs) {
    return (
      <div style={fullScreen}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Accès refusé
        </h1>
        <p style={muted}>Ton compte n'a pas accès à la section escaliers.</p>
        <Link to="/" style={{ color: ACC, textDecoration: 'none', marginTop: 12 }}>← Retour</Link>
      </div>
    );
  }
  return <StairsApp />;
}

function StairsApp() {
  const { user, logout, isAdmin } = useAuth();
  const confirm = useConfirm();
  const mobile = useIsMobile(720);

  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // entry | 'new' | null
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');

  const load = async () => {
    try { setItems(await api.stairs.list()); setErr(null); }
    catch (e) { setErr(humanize(e)); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    return items.filter((s) => {
      if (country && s.country !== country) return false;
      if (region && s.region !== region) return false;
      if (q) {
        const hay = `${s.name} ${s.notes} ${s.city} ${s.region} ${s.country}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, country, region]);

  const countries = useMemo(() => uniqueSorted(items, 'country'), [items]);
  const regions = useMemo(
    () => uniqueSorted((items || []).filter((s) => !country || s.country === country), 'region'),
    [items, country],
  );

  const remove = async (entry) => {
    const ok = await confirm({
      title: 'Supprimer cet escalier',
      message: `« ${entry.name} » sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try { await api.stairs.remove(entry.id); await load(); }
    catch (e) { setErr(humanize(e)); }
  };

  const regeocode = async (entry) => {
    try {
      const updated = await api.stairs.regeocode(entry.id);
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      setErr(humanize(e));
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050511', color: '#ede8f8', fontFamily: "'Inter',sans-serif" }}>
      <Header user={user} logout={logout} isAdmin={isAdmin} mobile={mobile} />

      <main style={{
        maxWidth: 1200, margin: '0 auto',
        padding: mobile
          ? '14px 14px 110px'
          : '28px clamp(16px,4vw,32px) 80px',
        display: 'grid', gap: mobile ? 14 : 22,
      }}>
        <div style={{
          display: 'flex',
          alignItems: mobile ? 'stretch' : 'flex-start',
          justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          flexDirection: mobile ? 'column' : 'row',
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: mobile ? 22 : 28, fontWeight: 700,
              letterSpacing: '-0.5px', marginBottom: 4,
            }}>
              Escaliers
            </h1>
            <p style={{ ...muted, fontSize: mobile ? 12.5 : 14 }}>
              Catalogue partagé : nb de marches, pair/impair, grandes marches, GPS.
            </p>
          </div>
          {!mobile && (
            <Button onClick={() => setEditing('new')}>+ Ajouter un escalier</Button>
          )}
        </div>

        {err && <Banner color="error">{err}</Banner>}

        <Stats items={items} mobile={mobile} />

        <Filters
          mobile={mobile}
          search={search} setSearch={setSearch}
          country={country} setCountry={setCountry}
          region={region} setRegion={setRegion}
          countries={countries} regions={regions}
        />

        <MapPanel items={filtered} mobile={mobile} onPick={(e) => setEditing(e)} />

        <StairsList
          items={filtered}
          mobile={mobile}
          onEdit={setEditing}
          onRemove={remove}
          onRegeocode={regeocode}
        />

        {editing !== null && (
          <StairForm
            entry={editing === 'new' ? null : editing}
            mobile={mobile}
            onSaved={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </main>

      {mobile && editing === null && (
        <button
          onClick={() => setEditing('new')}
          aria-label="Ajouter un escalier"
          style={fabStyle}
        >
          +
        </button>
      )}
    </div>
  );
}

function Header({ user, logout, isAdmin, mobile }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!mobile) setMenuOpen(false); }, [mobile]);

  const links = (
    <>
      <Link to="/project" style={navLinkStyle} onClick={() => setMenuOpen(false)}>Projets</Link>
      {isAdmin && (
        <Link to="/admin" style={navLinkStyle} onClick={() => setMenuOpen(false)}>Admin</Link>
      )}
      <Link to="/" style={navLinkStyle} onClick={() => setMenuOpen(false)}>↗ Site</Link>
      <Button variant="ghost" onClick={logout}>Déconnexion</Button>
    </>
  );

  return (
    <>
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(5,5,17,0.92)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid rgba(120,80,200,0.14)',
        padding: mobile ? '12px 14px' : '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
      }}>
        <Link to="/" style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
          fontSize: mobile ? 15 : 17, letterSpacing: '-0.3px',
          color: '#ede8f8', textDecoration: 'none',
        }}>
          Baptiste<span style={{ color: ACC }}>.</span>
        </Link>

        {mobile ? (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            style={{
              background: 'none', border: '1px solid rgba(80,50,130,0.28)',
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              color: menuOpen ? ACC : 'rgba(232,228,248,0.85)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <line x1="1" y1="2"  x2="17" y2="2"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="1" y1="7"  x2="17" y2="7"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="1" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.55)' }}>
              {user.name || user.email}
              <span style={{
                fontSize: 9, marginLeft: 8, padding: '1px 6px', borderRadius: 3,
                background: user.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                color: user.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>{user.role}</span>
            </span>
            {links}
          </div>
        )}
      </header>

      {mobile && menuOpen && (
        <div style={{
          position: 'sticky', top: 54, zIndex: 25,
          background: 'rgba(8,5,18,0.98)',
          borderBottom: '1px solid rgba(60,40,100,0.18)',
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{
            fontSize: 12, color: 'rgba(180,170,200,0.7)',
            paddingBottom: 8, borderBottom: '1px solid rgba(60,40,100,0.18)',
          }}>
            {user.name || user.email}
            <span style={{
              fontSize: 9, marginLeft: 8, padding: '1px 6px', borderRadius: 3,
              background: user.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
              color: user.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
              letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>{user.role}</span>
          </div>
          {links}
        </div>
      )}
    </>
  );
}

function Stats({ items, mobile }) {
  if (!items || !items.length) return null;
  const total = items.length;
  const even = items.filter((s) => s.isEven).length;
  const big = items.filter((s) => s.largeSteps).length;
  const byCountry = countBy(items, 'country');
  const topCountries = Object.entries(byCountry)
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <section style={{
      display: 'grid', gap: mobile ? 8 : 12,
      gridTemplateColumns: mobile
        ? 'repeat(2, minmax(0, 1fr))'
        : 'repeat(auto-fit, minmax(180px, 1fr))',
    }}>
      <StatCard label="Total" main={total} sub="recensés" mobile={mobile} />
      <StatCard
        label="Pair / Impair"
        main={`${pct(even, total)}%`}
        sub={`${even} pairs · ${total - even} impairs`}
        color={EVEN_COLOR}
        mobile={mobile}
      />
      <StatCard
        label="Grandes marches"
        main={`${pct(big, total)}%`}
        sub={`${big} sur ${total}`}
        color={BIG_RING}
        mobile={mobile}
      />
      <StatCard
        label="Top pays"
        main={topCountries[0]?.[0] || '—'}
        sub={topCountries.map(([k, v]) => `${k} ${v}`).join(' · ') || 'Aucune donnée'}
        mobile={mobile}
      />
    </section>
  );
}

function StatCard({ label, main, sub, color, mobile }) {
  return (
    <div style={{
      background: 'rgba(14,9,28,0.72)',
      border: '1px solid rgba(80,50,130,0.24)',
      borderRadius: 12, padding: mobile ? 12 : 16,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: mobile ? 10 : 11, color: 'rgba(180,170,200,0.7)',
        textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600,
        marginBottom: mobile ? 4 : 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif",
        fontSize: mobile ? 18 : 22, fontWeight: 700,
        color: color || '#ede8f8', letterSpacing: '-0.3px',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {main}
      </div>
      {sub && (
        <div style={{
          fontSize: mobile ? 11 : 12,
          color: 'rgba(180,170,200,0.6)', marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Filters({
  mobile, search, setSearch, country, setCountry, region, setRegion, countries, regions,
}) {
  return (
    <section style={{
      display: 'grid', gap: mobile ? 8 : 10,
      gridTemplateColumns: mobile
        ? '1fr'
        : 'minmax(180px, 1fr) minmax(140px, 200px) minmax(140px, 200px)',
    }}>
      <Input
        placeholder="Rechercher (nom, notes, ville…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        type="search"
        inputMode="search"
      />
      <div style={{
        display: mobile ? 'grid' : 'contents',
        gridTemplateColumns: mobile ? '1fr 1fr' : undefined,
        gap: 8,
      }}>
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setRegion(''); }}
          style={selectStyle}
        >
          <option value="">Tous les pays</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          style={selectStyle}
        >
          <option value="">Toutes régions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </section>
  );
}

function MapPanel({ items, mobile, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      // Wheel zoom on desktop only — on mobile the gesture conflicts with
      // page scroll; pinch-to-zoom (touchZoom, on by default) handles it.
      scrollWheelZoom: !mobile,
      tap: true,
    }).setView([46.6, 2.5], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Re-enable/disable scroll wheel zoom when the breakpoint flips without
  // tearing down the whole map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mobile) map.scrollWheelZoom.disable();
    else map.scrollWheelZoom.enable();
  }, [mobile]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !items) return;
    layer.clearLayers();
    const points = [];
    // Bigger tap targets on touch screens — 18 px markers are too easy to miss
    // when the map is zoomed out and several pins are clustered.
    const dotSize = mobile ? 24 : 18;
    const iconSize = dotSize + 6;
    for (const s of items) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
      const color = s.isEven ? EVEN_COLOR : ODD_COLOR;
      const ring = s.largeSteps ? `box-shadow: 0 0 0 3px ${BIG_RING};` : '';
      const html = `<div style="
        width:${dotSize}px;height:${dotSize}px;border-radius:50%;
        background:${color};border:2px solid #08051a;${ring}
      "></div>`;
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html, className: 'stairs-marker',
          iconSize: [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        }),
      });
      marker.bindPopup(popupHtml(s), { autoPan: true, closeButton: true });
      marker.on('click', () => marker.openPopup());
      const editBtn = () => onPick(s);
      marker.on('popupopen', () => {
        const el = document.querySelector(`[data-stair-edit="${s.id}"]`);
        if (el) el.addEventListener('click', editBtn, { once: true });
      });
      layer.addLayer(marker);
      points.push([s.lat, s.lng]);
    }
    if (points.length) {
      map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 14, animate: false });
    }
  }, [items, onPick, mobile]);

  return (
    <section>
      <Legend mobile={mobile} />
      <div
        ref={containerRef}
        style={{
          height: mobile ? 280 : 440,
          borderRadius: 12,
          border: '1px solid rgba(80,50,130,0.24)',
          overflow: 'hidden',
          // Leaflet's tiles look weird against the dark site palette; a slight
          // saturation tweak makes the map feel less out of place.
          filter: 'saturate(0.85) brightness(0.95)',
          // Prevent vertical page scroll while panning the map on touch.
          touchAction: 'pan-x pan-y',
        }}
      />
    </section>
  );
}

function Legend({ mobile }) {
  const dot = (color, ring) => (
    <span style={{
      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
      background: color, border: '2px solid #08051a',
      boxShadow: ring ? `0 0 0 2px ${BIG_RING}` : 'none', marginRight: 6,
      verticalAlign: 'middle',
    }} />
  );
  return (
    <div style={{
      display: 'flex', gap: mobile ? 10 : 14, flexWrap: 'wrap',
      marginBottom: 8,
      fontSize: mobile ? 11 : 12, color: 'rgba(180,170,200,0.7)',
    }}>
      <span>{dot(EVEN_COLOR)} Pair</span>
      <span>{dot(ODD_COLOR)} Impair</span>
      <span>{dot(EVEN_COLOR, true)} Grandes marches</span>
    </div>
  );
}

function StairsList({ items, mobile, onEdit, onRemove, onRegeocode }) {
  if (items === null) return <p style={muted}>Chargement…</p>;
  if (!items.length) {
    return (
      <p style={muted}>
        Aucun escalier enregistré. Clique sur « + Ajouter un escalier » pour commencer.
      </p>
    );
  }

  // Group by country > region
  const groups = {};
  for (const s of items) {
    const c = s.country || '— Sans pays —';
    const r = s.region  || '— Sans région —';
    groups[c] ??= {};
    groups[c][r] ??= [];
    groups[c][r].push(s);
  }
  const countryKeys = Object.keys(groups).sort();

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {countryKeys.map((c) => (
        <CountryGroup
          key={c}
          country={c}
          regions={groups[c]}
          mobile={mobile}
          onEdit={onEdit}
          onRemove={onRemove}
          onRegeocode={onRegeocode}
        />
      ))}
    </section>
  );
}

function CountryGroup({ country, regions, mobile, onEdit, onRemove, onRegeocode }) {
  const [open, setOpen] = useState(true);
  const total = Object.values(regions).reduce((acc, arr) => acc + arr.length, 0);
  return (
    <div style={{
      background: 'rgba(14,9,28,0.55)',
      border: '1px solid rgba(80,50,130,0.18)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', padding: '14px 18px',
          cursor: 'pointer', color: '#ede8f8',
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
          textAlign: 'left',
        }}
      >
        <span>{country}</span>
        <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.6)', fontWeight: 500 }}>
          {total} {total > 1 ? 'escaliers' : 'escalier'} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.keys(regions).sort().map((r) => (
            <div key={r}>
              <div style={{
                fontSize: 11, color: 'rgba(180,170,200,0.7)',
                textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600,
                marginBottom: 8,
              }}>
                {r}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regions[r].map((s) => (
                  <Row
                    key={s.id} entry={s} mobile={mobile}
                    onEdit={onEdit} onRemove={onRemove} onRegeocode={onRegeocode}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ entry, mobile, onEdit, onRemove, onRegeocode }) {
  const dotColor = entry.isEven ? EVEN_COLOR : ODD_COLOR;
  const needsGeo = !entry.country && !entry.region && !entry.city;
  return (
    <div
      onClick={mobile ? () => onEdit(entry) : undefined}
      style={{
        background: 'rgba(14,9,28,0.72)',
        border: '1px solid rgba(80,50,130,0.24)',
        borderRadius: 10, padding: mobile ? 12 : 12,
        display: 'flex',
        alignItems: mobile ? 'flex-start' : 'center',
        gap: mobile ? 10 : 12,
        flexWrap: 'wrap',
        cursor: mobile ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: mobile ? 16 : 14, height: mobile ? 16 : 14, borderRadius: '50%',
        background: dotColor, border: '2px solid #08051a',
        boxShadow: entry.largeSteps ? `0 0 0 2px ${BIG_RING}` : 'none',
        flexShrink: 0, marginTop: mobile ? 3 : 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: mobile ? 14.5 : 14, fontWeight: 600,
          color: '#ede8f8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.name}
        </div>
        <div style={{
          fontSize: mobile ? 12.5 : 12,
          color: 'rgba(180,170,200,0.6)', marginTop: 2,
          lineHeight: 1.4,
        }}>
          <strong style={{ color: '#ede8f8' }}>{entry.stepCount}</strong> marches
          {' · '}{entry.isEven ? 'pair' : 'impair'}
          {entry.largeSteps && ' · grandes'}
          {entry.stepHeightCm ? ` · ${entry.stepHeightCm} cm` : ''}
          {' · '}{formatDate(entry.encounteredAt)}
          {entry.city && ` · ${entry.city}`}
        </div>
        {entry.notes && (
          <div style={{
            fontSize: mobile ? 12.5 : 12,
            color: 'rgba(180,170,200,0.55)', marginTop: 4, fontStyle: 'italic',
          }}>
            {entry.notes}
          </div>
        )}
        {needsGeo && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11, color: BIG_RING, marginTop: 6,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              flexWrap: 'wrap',
            }}
          >
            ⚠ Localisation non résolue
            <button
              type="button"
              onClick={() => onRegeocode(entry)}
              style={miniBtn}
            >
              Réessayer
            </button>
          </div>
        )}
      </div>
      {!mobile && (
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={() => onEdit(entry)}>Éditer</Button>
          <Button variant="danger" onClick={() => onRemove(entry)}>Supprimer</Button>
        </div>
      )}
      {mobile && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', gap: 6, width: '100%',
            justifyContent: 'flex-end',
            paddingTop: 6, marginTop: 4,
            borderTop: '1px solid rgba(80,50,130,0.16)',
          }}
        >
          <Button variant="ghost" onClick={() => onEdit(entry)}>Éditer</Button>
          <Button variant="danger" onClick={() => onRemove(entry)}>Supprimer</Button>
        </div>
      )}
    </div>
  );
}

function StairForm({ entry, mobile, onSaved, onCancel }) {
  const isEdit = !!entry;
  const [name, setName] = useState(entry?.name || '');
  const [notes, setNotes] = useState(entry?.notes || '');
  const [stepCount, setStepCount] = useState(entry?.stepCount?.toString() || '');
  const [stepHeight, setStepHeight] = useState(entry?.stepHeightCm?.toString() || '');
  const [largeSteps, setLargeSteps] = useState(!!entry?.largeSteps);
  const [lat, setLat] = useState(entry?.lat ?? null);
  const [lng, setLng] = useState(entry?.lng ?? null);
  const [date, setDate] = useState(
    entry?.encounteredAt
      ? new Date(entry.encounteredAt * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [country, setCountry] = useState(entry?.country || '');
  const [region, setRegion] = useState(entry?.region || '');
  const [city, setCity] = useState(entry?.city || '');
  const [manualGeo, setManualGeo] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Lock body scroll while the modal is open so the page underneath doesn't
  // jump when the user touch-scrolls inside the form.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const captureLocation = () => {
    if (!('geolocation' in navigator)) {
      setErr('La géolocalisation n\'est pas disponible sur ce navigateur.');
      return;
    }
    setGeoLoading(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setGeoLoading(false);
      },
      (e) => {
        setGeoLoading(false);
        if (e.code === 1) setErr('Permission de géolocalisation refusée.');
        else if (e.code === 2) setErr('Position indisponible.');
        else if (e.code === 3) setErr('Délai dépassé pour la géolocalisation.');
        else setErr('Impossible d\'obtenir la position.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr('Le nom est obligatoire.'); return; }
    const sc = Math.floor(Number(stepCount));
    if (!Number.isFinite(sc) || sc <= 0) { setErr('Nombre de marches invalide.'); return; }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErr('Position GPS requise — utilise « Ma position ».');
      return;
    }
    const ts = Math.floor(new Date(date).getTime() / 1000);
    if (!Number.isFinite(ts) || ts <= 0) { setErr('Date invalide.'); return; }

    const payload = {
      name: name.trim(),
      notes: notes.trim(),
      stepCount: sc,
      stepHeightCm: stepHeight ? Number(stepHeight) : null,
      largeSteps,
      lat, lng,
      encounteredAt: ts,
    };
    if (manualGeo) {
      payload.country = country.trim();
      payload.region = region.trim();
      payload.city = city.trim();
    }
    setSaving(true);
    try {
      if (isEdit) await api.stairs.update(entry.id, payload);
      else await api.stairs.create(payload);
      onSaved();
    } catch (ex) {
      setErr(humanize(ex));
    } finally {
      setSaving(false);
    }
  };

  const hasPosition = Number.isFinite(lat) && Number.isFinite(lng);
  const fullWidthBtn = mobile ? { width: '100%', padding: '12px 14px' } : {};
  const numberFieldsCols = mobile ? 'repeat(2, minmax(0,1fr))' : '1fr 1fr 1fr';

  return (
    <div
      style={modalBackdrop(mobile)}
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={modalBox(mobile)}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: mobile ? 14 : 18,
        }}>
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: mobile ? 18 : 20, fontWeight: 700,
          }}>
            {isEdit ? 'Modifier l\'escalier' : 'Nouvel escalier'}
          </h2>
          {mobile && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Fermer"
              style={{
                background: 'transparent', border: 'none',
                color: 'rgba(180,170,200,0.7)', fontSize: 22,
                lineHeight: 1, cursor: 'pointer', padding: 4,
              }}
            >×</button>
          )}
        </div>

        {err && <Banner color="error">{err}</Banner>}

        {/* GPS comes first on mobile: when you're at the stairs you want to
            capture the position before anything else fades from RAM. */}
        <Field label="Position GPS *">
          <div style={{
            display: 'flex',
            gap: 10,
            alignItems: mobile ? 'stretch' : 'center',
            flexDirection: mobile ? 'column' : 'row',
            flexWrap: 'wrap',
          }}>
            <Button
              type="button"
              onClick={captureLocation}
              disabled={geoLoading}
              style={fullWidthBtn}
            >
              {geoLoading ? '📍 Localisation…' : (hasPosition ? '📍 Mettre à jour ma position' : '📍 Ma position')}
            </Button>
            {hasPosition ? (
              <span style={{
                fontFamily: 'monospace', fontSize: mobile ? 12 : 12,
                color: 'rgba(180,170,200,0.75)', wordBreak: 'break-all',
              }}>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.5)' }}>
                Aucune position
              </span>
            )}
          </div>
        </Field>

        <Field label="Nom / lieu *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Métro Châtelet sortie 3"
            autoFocus={!mobile}
            required
            autoCapitalize="sentences"
          />
        </Field>

        <div style={{
          display: 'grid',
          gridTemplateColumns: numberFieldsCols,
          gap: 10,
        }}>
          <Field label="Marches *">
            <Input
              type="number" min={1} step={1}
              value={stepCount}
              onChange={(e) => setStepCount(e.target.value)}
              required
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </Field>
          <Field label="Hauteur (cm)">
            <Input
              type="number" min={0} step={0.5}
              value={stepHeight}
              onChange={(e) => setStepHeight(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Date *">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={mobile ? { gridColumn: '1 / -1' } : undefined}
            />
          </Field>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 14,
          padding: mobile ? '10px 12px' : 0,
          background: mobile ? 'rgba(14,9,28,0.55)' : 'transparent',
          border: mobile ? '1px solid rgba(80,50,130,0.24)' : 'none',
          borderRadius: mobile ? 8 : 0,
          cursor: 'pointer', fontSize: mobile ? 14 : 13.5, color: '#ede8f8',
        }}>
          <input
            type="checkbox"
            checked={largeSteps}
            onChange={(e) => setLargeSteps(e.target.checked)}
            style={{ accentColor: ACC, width: 18, height: 18, flexShrink: 0 }}
          />
          Grandes marches
        </label>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optionnel"
            rows={mobile ? 2 : 3}
          />
        </Field>

        <div style={{
          background: 'rgba(14,9,28,0.55)', border: '1px solid rgba(80,50,130,0.18)',
          borderRadius: 10, padding: 12, marginBottom: 14,
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', fontSize: mobile ? 13 : 12,
            color: 'rgba(180,170,200,0.85)', lineHeight: 1.4,
          }}>
            <input
              type="checkbox"
              checked={manualGeo}
              onChange={(e) => setManualGeo(e.target.checked)}
              style={{ accentColor: ACC, width: 16, height: 16, flexShrink: 0 }}
            />
            <span>Saisir manuellement pays / région / ville</span>
          </label>
          {manualGeo && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr',
              gap: 8, marginTop: 10,
            }}>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Pays" autoCapitalize="words" />
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Région" autoCapitalize="words" />
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" autoCapitalize="words" />
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          flexDirection: mobile ? 'column-reverse' : 'row',
          // Sticky save bar on mobile so it's always reachable without
          // scrolling the modal back up.
          position: mobile ? 'sticky' : 'static',
          bottom: mobile ? -16 : 'auto',
          background: mobile ? '#0b0620' : 'transparent',
          margin: mobile ? '0 -16px -16px' : 0,
          padding: mobile ? '12px 16px' : 0,
          borderTop: mobile ? '1px solid rgba(80,50,130,0.24)' : 'none',
        }}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} style={fullWidthBtn}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving} style={fullWidthBtn}>
            {saving ? '…' : (isEdit ? 'Mettre à jour' : 'Créer')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Banner({ color, children }) {
  const palette = color === 'error'
    ? { bg: 'rgba(255,100,120,0.08)', border: 'rgba(255,100,120,0.3)', fg: '#ff8a9b' }
    : { bg: 'rgba(120,220,160,0.08)', border: 'rgba(120,220,160,0.3)', fg: '#9be9b6' };
  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 8, padding: '10px 14px', color: palette.fg, fontSize: 13,
      marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

// ── helpers ──
function uniqueSorted(items, key) {
  if (!items) return [];
  const set = new Set();
  for (const it of items) {
    const v = it[key];
    if (v) set.add(v);
  }
  return [...set].sort();
}
function countBy(items, key) {
  const out = {};
  for (const it of items) {
    const v = it[key] || '';
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}
function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
function popupHtml(s) {
  const big = s.largeSteps ? ' · grandes' : '';
  const cm = s.stepHeightCm ? ` · ${s.stepHeightCm} cm` : '';
  return `
    <div style="font-family: 'Inter', sans-serif; font-size: 12.5px; min-width: 180px;">
      <div style="font-weight:700; font-size:13.5px; margin-bottom:4px;">${escapeHtml(s.name)}</div>
      <div><strong>${s.stepCount}</strong> marches · ${s.isEven ? 'pair' : 'impair'}${big}${cm}</div>
      ${s.city || s.country ? `<div style="opacity:0.7;">${escapeHtml([s.city, s.region, s.country].filter(Boolean).join(', '))}</div>` : ''}
      <div style="margin-top:6px;">
        <button data-stair-edit="${s.id}" style="
          background:#c9a8e8;color:#08051a;border:none;border-radius:4px;
          padding:3px 8px;font-size:11px;cursor:pointer;font-weight:600;
        ">Éditer</button>
      </div>
    </div>
  `;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const MESSAGES = {
  forbidden: "Tu n'as pas accès à cette ressource.",
  not_found: 'Élément introuvable.',
  missing_name: 'Le nom est obligatoire.',
  invalid_step_count: 'Nombre de marches invalide.',
  invalid_coordinates: 'Coordonnées GPS invalides.',
  invalid_date: 'Date invalide.',
  geocoding_failed: 'Le service de géolocalisation est indisponible.',
};
function humanize(err) {
  const key = err?.body?.error || err?.message;
  return MESSAGES[key] || err?.message || 'Erreur inconnue.';
}

// ── styles ──
const muted = { color: 'rgba(180,170,200,0.6)', fontFamily: "'Inter',sans-serif", fontSize: 13 };
const fullScreen = {
  minHeight: '100vh', background: '#050511',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexDirection: 'column', gap: 8, color: '#ede8f8', fontFamily: "'Inter',sans-serif",
  padding: 24, textAlign: 'center',
};
const navLinkStyle = {
  color: 'rgba(180,170,200,0.7)', textDecoration: 'none',
  fontSize: 13, padding: '8px 14px',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8,
};
const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)',
  border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '10px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};
const miniBtn = {
  background: 'transparent', border: '1px solid rgba(255,209,102,0.4)',
  borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
  color: BIG_RING, fontSize: 11, fontFamily: "'Inter',sans-serif",
};
const modalBackdrop = (mobile) => ({
  position: 'fixed', inset: 0, zIndex: 60,
  background: 'rgba(2,2,12,0.7)', backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: mobile ? 'flex-end' : 'flex-start',
  justifyContent: 'center',
  padding: mobile ? 0 : '60px 16px',
  overflowY: 'auto',
});
const modalBox = (mobile) => ({
  width: '100%',
  maxWidth: mobile ? '100%' : 560,
  maxHeight: mobile ? '92vh' : 'none',
  overflowY: 'auto',
  background: '#0b0620',
  border: `1px solid rgba(${ACC_RGB},0.3)`,
  borderRadius: mobile ? '16px 16px 0 0' : 16,
  padding: mobile ? 16 : 24,
  paddingBottom: mobile ? 0 : 24,
  boxShadow: '0 -24px 64px rgba(0,0,0,0.5)',
});
const fabStyle = {
  position: 'fixed',
  right: 18, bottom: 22, zIndex: 40,
  width: 60, height: 60, borderRadius: '50%',
  background: ACC, color: '#08051a',
  border: 'none', cursor: 'pointer',
  fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 700,
  lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 4px rgba(201,168,232,0.18)',
  paddingBottom: 4,
};
