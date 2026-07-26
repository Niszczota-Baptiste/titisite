import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { Login } from '../components/admin/Login';
import { Modal, formatDate } from '../components/project/shared';
import { useConfirm } from '../ui/ConfirmProvider';
import { useToast } from '../ui/ToastProvider';
import { VaultApp } from '../components/vault/VaultApp';
import { GOLD, GOLD_RGB, INK, MUTED, body, mono, panel, title } from '../components/vault/theme';

// Atelier « Salle des coffres » — conception en amont d'une salle des coffres
// Minefield. Module global (comme /quetes) : un plan appartient à un compte et
// se partage explicitement. Le point d'entrée est l'onglet ⛏️ Minecraft des
// projets, d'où le paramètre ?projet=<slug> pour le lien de retour.

export default function Atelier() {
  const { user, loading } = useAuth();
  usePageMeta('Salle des coffres');

  if (loading) return <Screen>Chargement…</Screen>;
  if (!user) {
    return <Login title="Salle des coffres" subtitle="Connecte-toi pour accéder à l’atelier." />;
  }
  if (!user.canViewVault) {
    return (
      <Screen>
        <h1 style={{ ...title, fontSize: 22 }}>Accès refusé</h1>
        <p style={{ ...body, color: MUTED }}>Ton compte n’a pas accès à l’atelier des coffres.</p>
        <Link to="/" style={{ ...body, color: GOLD, textDecoration: 'none', marginTop: 12 }}>← Retour</Link>
      </Screen>
    );
  }
  return <AtelierShell />;
}

function AtelierShell() {
  const navigate = useNavigate();

  // Projet d'origine (lien « 🗝️ Salle des coffres » de l'onglet Minecraft),
  // mémorisé en session pour survivre aux rechargements — comme /quetes.
  const fromProject = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('projet');
    const slug = raw && /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null;
    if (slug) sessionStorage.setItem('coffres_from_project', slug);
    return slug || sessionStorage.getItem('coffres_from_project');
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 50% -10%, #1a1330, #070512 60%)', paddingBottom: 60 }}>
      <Banner backSlug={fromProject} />
      <div style={{ maxWidth: 1520, margin: '0 auto', padding: '0 18px' }}>
        <Routes>
          <Route index element={<PlanList onOpen={(id) => navigate(`/atelier-coffres/${id}`)} />} />
          <Route
            path=":id"
            element={<PlanRoute onBack={() => navigate('/atelier-coffres')} onOpenPlan={(id) => navigate(`/atelier-coffres/${id}`)} />}
          />
        </Routes>
      </div>
    </div>
  );
}

function PlanRoute({ onBack, onOpenPlan }) {
  const { id } = useParams();
  return <VaultApp planId={Number(id)} onBack={onBack} onOpenPlan={onOpenPlan} />;
}

// ── Liste des plans ───────────────────────────────────────────────────────

function PlanList({ onOpen }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [plans, setPlans] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => api.vault.list().then(setPlans).catch((e) => toast.error(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  const remove = async (plan) => {
    const ok = await confirm({
      title: `Supprimer « ${plan.name} » ?`,
      message: 'Le plan et ses snapshots seront définitivement supprimés.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try { await api.vault.remove(plan.id); await load(); toast.success('Plan supprimé'); }
    catch (e) { toast.error(e.message); }
  };

  if (plans === null) return <p style={{ ...body, color: MUTED }}>Chargement…</p>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ ...title, fontSize: 18, flex: 1 }}>Mes plans</h2>
        <button type="button" onClick={() => setCreating(true)} style={primaryBtn}>+ Nouveau plan</button>
      </div>

      {plans.length === 0 && (
        <div style={{ ...panel, ...body, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          Aucun plan pour l’instant. Un plan, c’est un gabarit (par défaut 125 × 200 × 125),
          des étages, des zones de rangement, des rangées de coffres et la circulation qui
          les dessert — pour concevoir la salle avant de poser le premier bloc en jeu.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {plans.map((p) => (
          <div key={p.id} style={{ ...panel, display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h3 style={{ ...title, fontSize: 15, flex: 1 }}>{p.name}</h3>
              {p.role === 'shared' && <span style={badge}>partagé</span>}
            </div>
            <div style={{ ...mono, fontSize: 10.5, color: MUTED }}>
              {p.dims.x}×{p.dims.y}×{p.dims.z} · MC {p.mcVersion} · rév. {p.revision}
            </div>
            <div style={{ ...body, fontSize: 12, color: INK }}>
              {p.stats.floors} étages · {p.stats.zones} zones · {p.stats.chests} coffres
              {' '}· <span style={{ color: GOLD }}>{p.stats.slots} slots</span>
            </div>
            {p.stats.reservedZones > 0 && (
              <div style={{ ...body, fontSize: 11, color: MUTED }}>
                {p.stats.reservedZones} zone(s) réservée(s) MàJ — {p.stats.reservedVolumePct} % du volume
              </div>
            )}
            <div style={{ ...body, fontSize: 11, color: MUTED }}>
              modifié {formatDate(p.updatedAt)}{p.updatedByName ? ` par ${p.updatedByName}` : ''}
              {p.sharedWith?.length > 0 && ` · avec ${p.sharedWith.map((s) => s.name).join(', ')}`}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <button type="button" onClick={() => onOpen(p.id)} style={primaryBtn}>Ouvrir</button>
              {p.role === 'owner' && (
                <button type="button" onClick={() => remove(p)} style={dangerBtn}>Supprimer</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(plan) => { setCreating(false); onOpen(plan.id); }}
      />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('Salle des coffres');
  const [mcVersion, setMcVersion] = useState('1.21');
  const [dims, setDims] = useState({ x: 125, y: 200, z: 125 });
  const [useOrigin, setUseOrigin] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: -60, z: 0 });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const plan = await api.vault.create({
        name, mcVersion, dims, worldOrigin: useOrigin ? origin : null,
      });
      onCreated(plan);
    } catch (err) {
      toast.error(err.body?.detail ? `${err.message} (${err.body.detail})` : err.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau plan" width={520}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Field label="Nom">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} required />
        </Field>
        <Field label="Dimensions du gabarit (X × Y × Z, en blocs)">
          <div style={{ display: 'flex', gap: 8 }}>
            {['x', 'y', 'z'].map((axis) => (
              <input
                key={axis} type="number" min={1} max={1024} value={dims[axis]}
                onChange={(e) => setDims((d) => ({ ...d, [axis]: Math.max(1, Math.min(1024, Number(e.target.value) || 1)) }))}
                style={input}
              />
            ))}
          </div>
          <div style={{ ...body, fontSize: 11, color: MUTED, marginTop: 4 }}>
            L’axe de 200 peut aussi être une longueur : les trois dimensions sont libres.
          </div>
        </Field>
        <Field label="Version Minecraft">
          <input value={mcVersion} onChange={(e) => setMcVersion(e.target.value)} style={input} />
        </Field>
        <label style={{ ...body, fontSize: 12.5, color: INK, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={useOrigin} onChange={(e) => setUseOrigin(e.target.checked)} style={{ accentColor: GOLD }} />
          Ancrer le plan à des coordonnées monde
        </label>
        {useOrigin && (
          <div style={{ display: 'flex', gap: 8 }}>
            {['x', 'y', 'z'].map((axis) => (
              <input
                key={axis} type="number" value={origin[axis]}
                onChange={(e) => setOrigin((o) => ({ ...o, [axis]: Math.trunc(Number(e.target.value) || 0) }))}
                style={input}
              />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Annuler</button>
          <button type="submit" disabled={busy} style={primaryBtn}>{busy ? '…' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ ...body, fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Banner({ backSlug }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', marginBottom: 22,
      background: 'linear-gradient(135deg, rgba(60,45,20,0.55), rgba(30,18,55,0.75))',
      borderBottom: `2px solid rgba(${GOLD_RGB},0.28)`,
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5,
        background: `radial-gradient(circle at 12% 20%, rgba(${GOLD_RGB},0.22), transparent 42%), radial-gradient(circle at 88% 30%, rgba(201,168,232,0.16), transparent 45%)`,
      }} />
      <div style={{
        position: 'relative', maxWidth: 1520, margin: '0 auto', padding: '28px 18px 22px',
        display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...mono, fontSize: 11.5, letterSpacing: '3px', textTransform: 'uppercase', color: GOLD }}>
            Minefield · conception
          </div>
          <h1 style={{ ...title, fontSize: 30, margin: '4px 0 0' }}>🗝️ Salle des coffres</h1>
          <p style={{ ...body, fontSize: 13, color: 'rgba(214,206,232,0.75)', margin: '5px 0 0' }}>
            Schéma d’organisation : étages, zones, rangées de coffres et circulation. Aucun contenu, aucun stock.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {backSlug && (
            <Link to={`/project/${backSlug}/minecraft`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10,
              textDecoration: 'none', ...body, fontSize: 13, fontWeight: 600,
              background: 'rgba(14,9,28,0.72)', color: GOLD, border: `1px solid ${GOLD}`,
            }}>⛏️ ← Retour au projet</Link>
          )}
          <Link to="/" style={{ ...body, color: MUTED, textDecoration: 'none', fontSize: 13 }}>← Site</Link>
        </div>
      </div>
    </div>
  );
}

function Screen({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#070512', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, color: INK,
      ...body,
    }}>{children}</div>
  );
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 13,
};

const primaryBtn = {
  padding: '7px 13px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12.5, fontWeight: 700,
  background: `rgba(${GOLD_RGB},0.16)`, border: `1px solid rgba(${GOLD_RGB},0.5)`, color: GOLD,
};

const ghostBtn = {
  padding: '7px 13px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12.5,
  background: 'transparent', border: '1px solid rgba(120,100,170,0.35)', color: INK,
};

const dangerBtn = {
  padding: '7px 11px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

const badge = {
  ...body, fontSize: 10, padding: '2px 7px', borderRadius: 999,
  background: 'rgba(201,168,232,0.14)', border: '1px solid rgba(201,168,232,0.4)', color: '#c9a8e8',
};
