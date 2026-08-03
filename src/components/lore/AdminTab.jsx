import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, formatDate, panel } from './theme';

// Onglet « 🛡 Admin » — surveillance du module Lore, rôle admin STRICT.
// Le serveur refait le contrôle (requireRole('admin') sur /lore/admin/*) :
// masquer l'onglet côté client n'est qu'un confort, jamais la sécurité.
//
// Trois vues, chacune pour une question précise :
//   👥 Membres  — qui produit quoi, et qui supprime beaucoup ;
//   🖼 Médias   — le site sert-il d'hébergement d'images perso ?
//   📜 Journal  — que s'est-il passé, et surtout : qu'a-t-on effacé ?

const KB = 1024;
export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < KB) return `${b} o`;
  if (b < KB * KB) return `${(b / KB).toFixed(0)} Ko`;
  if (b < KB * KB * KB) return `${(b / (KB * KB)).toFixed(1)} Mo`;
  return `${(b / (KB * KB * KB)).toFixed(2)} Go`;
}

// Seuils d'alerte. Volontairement indicatifs : ils attirent l'œil, ils
// n'accusent personne — c'est l'admin qui juge sur pièces.
const BIG_FILE = 3 * KB * KB;      // 3 Mo : gros pour une capture d'enquête
const HEAVY_MEMBER = 60 * KB * KB; // 60 Mo cumulés par membre

const ACTIONS = { create: { label: 'Ajout', color: ACC }, update: { label: 'Modif.', color: GOLD }, delete: { label: 'Suppr.', color: CRIMSON } };
const TYPE_LABELS = {
  entry: 'Entrée', hypothesis: 'Hypothèse', media: 'Média', link: 'Lien', tag: 'Tag',
  shape: 'Tracé', map: 'Carte', map_image: 'Fond de carte', tile: 'Tuile',
  peuple: 'Peuple', dialogue: 'Dialogue', evidence: 'Preuve',
};

const VIEWS = [['membres', '👥 Membres'], ['medias', '🖼 Médias'], ['journal', '📜 Journal']];

export function AdminTab() {
  const [view, setView] = useState('membres');
  const [overview, setOverview] = useState(null);
  const [media, setMedia] = useState(null);
  const [journal, setJournal] = useState(null);
  const [filter, setFilter] = useState({ actor: '', action: '', type: '' });
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.lore.admin.overview()
      .then((d) => { if (alive) setOverview(d); })
      .catch((e) => { if (alive) setErr(e?.body?.error === 'forbidden' ? 'Réservé aux administrateurs.' : e.message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (view !== 'medias' || media !== null) return undefined;
    let alive = true;
    api.lore.admin.media({ limit: 300 })
      .then((d) => { if (alive) setMedia(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [view, media]);

  useEffect(() => {
    if (view !== 'journal') return undefined;
    let alive = true;
    setJournal(null);
    api.lore.admin.journal({
      actor: filter.actor || undefined,
      action: filter.action || undefined,
      type: filter.type || undefined,
      limit: 300,
    })
      .then((d) => { if (alive) setJournal(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [view, filter]);

  if (err) return <p style={{ color: CRIMSON, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err}</p>;
  if (!overview) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>Chargement…</p>;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <StorageBanner storage={overview.storage} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {VIEWS.map(([k, label]) => (
          <button
            key={k} type="button" onClick={() => setView(k)}
            style={{
              padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600,
              background: view === k ? `rgba(${ACC_RGB},0.16)` : 'transparent',
              color: view === k ? ACC : MUTED,
              border: `1px solid rgba(${ACC_RGB},${view === k ? 0.4 : 0.15})`,
            }}
          >{label}</button>
        ))}
      </div>

      {view === 'membres' && <MembersView members={overview.members} />}
      {view === 'medias' && <MediaView media={media} />}
      {view === 'journal' && (
        <JournalView
          journal={journal} members={overview.members}
          filter={filter} setFilter={setFilter}
        />
      )}
    </div>
  );
}

function StorageBanner({ storage }) {
  const tiles = storage.byType.find((t) => t.mimeType === 'image/webp');
  return (
    <div style={{ ...panel, padding: '14px 18px', display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <Stat label="Médias" value={storage.mediaCount} />
      <Stat label="Poids total" value={formatBytes(storage.mediaBytes)} accent={storage.mediaBytes > 500 * KB * KB ? GOLD : ACC} />
      <Stat label="Tuiles de carte" value={storage.tileCount} />
      <Stat
        label="Orphelins"
        value={`${storage.orphanCount} · ${formatBytes(storage.orphanBytes)}`}
        accent={storage.orphanCount > 0 ? GOLD : undefined}
        title="Fichiers rattachés à aucune entrée ni hypothèse — les premiers suspects d'un dépôt perso."
      />
      {tiles && <Stat label="dont WebP" value={formatBytes(tiles.bytes)} />}
    </div>
  );
}

function Stat({ label, value, accent, title }) {
  return (
    <div title={title}>
      <div style={{ color: MUTED, fontSize: 11, fontFamily: "'Inter',sans-serif", textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ color: accent || INK, fontSize: 19, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
    </div>
  );
}

function MembersView({ members }) {
  if (members.length === 0) return <Empty>Personne n'a encore accès au lore.</Empty>;
  return (
    <div style={{ ...panel, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter',sans-serif", fontSize: 13, minWidth: 640 }}>
        <thead>
          <tr>
            {['Membre', 'Entrées', 'Hypoth.', 'Médias', 'Poids déposé', 'Suppressions', 'Dernière action'].map((h, i) => (
              <th key={h} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const heavy = m.mediaBytes > HEAVY_MEMBER;
            return (
              <tr key={m.id} style={{ borderTop: '1px solid rgba(60,130,90,0.14)' }}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <div style={{ color: INK, fontWeight: 600 }}>
                    {m.name || m.email}
                    {m.role === 'admin' && <span style={badge}>admin</span>}
                  </div>
                  <div style={{ color: MUTED, fontSize: 11 }}>{m.email}</div>
                </td>
                <td style={td}>{m.entries}</td>
                <td style={td}>{m.hypotheses}</td>
                <td style={td}>{m.mediaCount}</td>
                <td style={{ ...td, color: heavy ? GOLD : INK, fontWeight: heavy ? 700 : 400 }}
                  title={heavy ? 'Volume inhabituel pour une enquête — à regarder dans l’onglet Médias.' : undefined}>
                  {formatBytes(m.mediaBytes)}{heavy && ' ⚠'}
                </td>
                <td style={{ ...td, color: m.deletions > 0 ? CRIMSON : MUTED }}>{m.deletions}</td>
                <td style={{ ...td, color: MUTED, fontSize: 12 }}>
                  {m.lastActionAt ? formatDate(m.lastActionAt) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ ...note, margin: '10px 14px 12px' }}>
        « Suppressions » compte les actions journalisées depuis la mise en place du
        journal — l'historique antérieur n'existe pas.
      </p>
    </div>
  );
}

function MediaView({ media }) {
  if (media === null) return <Empty>Chargement des médias…</Empty>;
  if (media.length === 0) return <Empty>Aucun média déposé.</Empty>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={note}>
        Triés du plus lourd au plus léger. Un fichier volumineux, sans légende et
        rattaché à rien est le profil type du dépôt personnel.
      </p>
      {media.map((m) => {
        const orphan = !m.target;
        const big = m.size > BIG_FILE;
        return (
          <div key={m.id} style={{
            ...panel, padding: 10, display: 'flex', gap: 12, alignItems: 'center',
            borderColor: orphan && big ? 'rgba(224,82,111,0.4)' : panel.border.split(' ').slice(2).join(' '),
          }}>
            <img
              src={`/api/lore/media/file/${m.filename}`} alt=""
              loading="lazy"
              style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 8, background: 'rgba(0,0,0,0.35)', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: INK, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.originalName || m.filename}
              </div>
              <div style={{ color: MUTED, fontSize: 11.5, fontFamily: "'Inter',sans-serif", marginTop: 2 }}>
                {m.uploaderName} · {formatDate(m.createdAt)} · {m.mimeType || 'type inconnu'}
                {m.width ? ` · ${m.width}×${m.height}` : ''}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 3, fontFamily: "'Inter',sans-serif" }}>
                {m.target
                  ? <span style={{ color: MUTED }}>rattaché à « {m.target.title || `#${m.target.id}`} »</span>
                  : <span style={{ color: GOLD }}>⚠ rattaché à rien</span>}
                {m.caption ? <span style={{ color: MUTED }}> · légendé</span> : <span style={{ color: MUTED }}> · sans légende</span>}
              </div>
            </div>
            <div style={{ color: big ? GOLD : INK, fontWeight: 700, fontSize: 14, fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}>
              {formatBytes(m.size)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JournalView({ journal, members, filter, setFilter }) {
  const set = (k) => (e) => setFilter((f) => ({ ...f, [k]: e.target.value }));
  const types = useMemo(
    () => [...new Set((journal || []).map((j) => j.targetType))].sort(),
    [journal],
  );
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={filter.actor} onChange={set('actor')} style={select}>
          <option value="">Tous les membres</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
        </select>
        <select value={filter.action} onChange={set('action')} style={select}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filter.type} onChange={set('type')} style={select}>
          <option value="">Tous les objets</option>
          {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
        </select>
      </div>

      {journal === null && <Empty>Chargement du journal…</Empty>}
      {journal && journal.length === 0 && <Empty>Aucune action enregistrée pour ce filtre.</Empty>}
      {journal && journal.map((j) => {
        const a = ACTIONS[j.action] || { label: j.action, color: MUTED };
        const d = j.detail || {};
        return (
          <div key={j.id} style={{ ...panel, padding: '9px 13px', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{
              color: a.color, border: `1px solid ${a.color}44`, borderRadius: 6,
              padding: '2px 8px', fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0,
            }}>{a.label}</span>
            <span style={{ color: MUTED, fontSize: 12, fontFamily: "'Inter',sans-serif", flexShrink: 0 }}>
              {TYPE_LABELS[j.targetType] || j.targetType}
            </span>
            <span style={{ color: INK, fontSize: 13, flex: 1, minWidth: 160, fontFamily: "'Inter',sans-serif" }}>
              {j.label || <em style={{ color: MUTED }}>sans titre</em>}
              {/* Le poids d'une suppression : ce que la cascade a emporté. */}
              {j.action === 'delete' && d.mediaCount > 0 && (
                <span style={{ color: CRIMSON, fontSize: 11.5 }}>
                  {' '}— avec {d.mediaCount} média(s), {formatBytes(d.mediaBytes)}
                </span>
              )}
              {j.action === 'delete' && d.evidenceCount > 0 && (
                <span style={{ color: CRIMSON, fontSize: 11.5 }}> · {d.evidenceCount} preuve(s)</span>
              )}
              {j.targetType === 'media' && d.size != null && (
                <span style={{ color: MUTED, fontSize: 11.5 }}> · {formatBytes(d.size)} {d.mimeType || ''}</span>
              )}
            </span>
            <span style={{ color: MUTED, fontSize: 12, fontFamily: "'Inter',sans-serif", flexShrink: 0 }}>
              {j.actorName}
            </span>
            <span style={{ color: MUTED, fontSize: 11.5, fontFamily: "'Inter',sans-serif", flexShrink: 0 }}>
              {formatDate(j.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }) {
  return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{children}</p>;
}

const th = {
  padding: '10px 12px', color: MUTED, fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
};
const td = { padding: '9px 12px', color: INK, textAlign: 'right', whiteSpace: 'nowrap' };
const badge = {
  marginLeft: 7, fontSize: 10, color: ACC, border: `1px solid rgba(${ACC_RGB},0.35)`,
  borderRadius: 5, padding: '1px 5px', fontWeight: 600,
};
const note = { color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 12, fontStyle: 'italic' };
const select = {
  padding: '7px 10px', borderRadius: 8, fontSize: 13, fontFamily: "'Inter',sans-serif",
  background: 'rgba(9,20,15,0.8)', color: INK, border: `1px solid rgba(${ACC_RGB},0.2)`,
};
