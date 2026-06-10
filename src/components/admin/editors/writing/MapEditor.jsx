import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../../api/client';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import {
  BIOME_OPTIONS, BUILDINGS, MAP_RADIUS, TERRAIN_TEMPLATE, ZONE_KINDS,
} from '../../../writing/map/presets';
import { ACC, ACC_RGB, Button, Field, Input, Textarea } from '../../ui';
import { ImageUploadField } from '../../ImageUploadField';
import { DirtyBadge, GenreTags, MarkdownField, SelectField, blockLabel, blockStyle } from './widgets';

// Same lazy chunk as the public map — three.js never enters the admin bundle.
const MapScene = lazy(() => import('../../../writing/map/Scene'));

const draftOf = (z) => ({
  kind: z.kind, targetId: z.targetId, title: z.title, subtitle: z.subtitle,
  description: z.description, content: z.content, coverImage: z.coverImage,
  category: z.category, tags: z.tags || [], date: z.date, link: z.link,
  building: z.building, scale: z.scale, rotation: z.rotation,
  // Legacy rows stored plain ids; normalize to { to, style }.
  connections: (z.connections || []).map((c) => (typeof c === 'number' ? { to: c, style: 'route' } : c)),
});

// « Carte » tab of a project workspace: pick the biome, then place/edit the
// zones by dragging them directly on the 3D island.
export function MapEditor({ projectId }) {
  const confirm = useConfirm();
  const [project, setProject] = useState(null);
  const [zones, setZones] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [terrainText, setTerrainText] = useState('');
  const [terrainOpen, setTerrainOpen] = useState(false);
  const [terrainErr, setTerrainErr] = useState('');

  const zonesApi = useMemo(() => api.writing.mapZonesFor(projectId), [projectId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.writing.projects.get(projectId), zonesApi.list()]).then(([p, zs]) => {
      if (!alive) return;
      setProject(p);
      setZones(zs);
      setTerrainText(p.mapTerrain ? JSON.stringify(p.mapTerrain, null, 2) : '');
      setLoading(false);
    }).catch(() => { if (alive) { setErr('Chargement impossible.'); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, zonesApi]);

  const select = useCallback((id) => {
    setSelectedId(id);
    setDirty(false);
    setErr('');
    setDraft(id == null ? null : (() => {
      const z = zones.find((x) => x.id === id);
      return z ? draftOf(z) : null;
    })());
  }, [zones]);

  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const setBiome = async (mapBiome) => {
    setProject((p) => ({ ...p, mapBiome }));
    try { await api.writing.projects.update(projectId, { mapBiome }); }
    catch { setErr('Biome non enregistré.'); }
  };

  // Terrain JSON: validated locally, persisted, and applied live to the
  // preview (the engine re-clamps everything anyway).
  const applyTerrain = async () => {
    setTerrainErr('');
    let parsed = null;
    if (terrainText.trim()) {
      try { parsed = JSON.parse(terrainText); } catch { setTerrainErr('JSON invalide — vérifie virgules et guillemets.'); return; }
      if (typeof parsed !== 'object' || Array.isArray(parsed)) { setTerrainErr('Le terrain doit être un objet JSON.'); return; }
    }
    try {
      await api.writing.projects.update(projectId, { mapTerrain: parsed });
      setProject((p) => ({ ...p, mapTerrain: parsed }));
    } catch (e) {
      setTerrainErr(e?.body?.error === 'terrain_too_large' ? 'Terrain trop volumineux (max 120 Ko).' : 'Enregistrement impossible.');
    }
  };

  const insertTemplate = () => {
    setTerrainText(JSON.stringify(TERRAIN_TEMPLATE, null, 2));
    setTerrainErr('');
  };

  // Live position while dragging, persisted once on drop.
  const moveZone = useCallback((id, x, z) => {
    setZones((zs) => zs.map((zone) => (zone.id === id ? { ...zone, x, z } : zone)));
  }, []);
  const moveEnd = useCallback((id) => {
    setZones((zs) => {
      const zone = zs.find((z) => z.id === id);
      if (zone) zonesApi.update(id, { x: zone.x, z: zone.z }).catch(() => setErr('Position non enregistrée.'));
      return zs;
    });
  }, [zonesApi]);

  const addZone = async () => {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * (MAP_RADIUS - 6);
    try {
      const z = await zonesApi.create({
        kind: 'libre', title: 'Nouvelle zone', building: 'tour',
        x: Math.round(Math.cos(a) * r * 10) / 10, z: Math.round(Math.sin(a) * r * 10) / 10,
      });
      setZones((zs) => [...zs, z]);
      setSelectedId(z.id);
      setDraft(draftOf(z));
      setDirty(false);
    } catch { setErr('Création impossible.'); }
  };

  const saveDraft = async () => {
    if (!draft || selectedId == null) return;
    setErr('');
    try {
      const z = await zonesApi.update(selectedId, draft);
      setZones((zs) => zs.map((x) => (x.id === z.id ? z : x)));
      setDraft(draftOf(z));
      setDirty(false);
    } catch (e) {
      setErr(e?.body?.error === 'invalid_target' ? 'Choisis un contenu à lier (ou passe la zone en « libre »).' : 'Enregistrement impossible.');
    }
  };

  const removeZone = async () => {
    const zone = zones.find((z) => z.id === selectedId);
    if (!zone) return;
    const ok = await confirm({
      title: 'Supprimer cette zone',
      message: `« ${zone.title || 'Sans titre'} » disparaîtra de la carte.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await zonesApi.remove(zone.id);
      setZones((zs) => zs.filter((z) => z.id !== zone.id)
        .map((z) => ({ ...z, connections: (z.connections || []).filter((id) => id !== zone.id) })));
      select(null);
    } catch { setErr('Suppression impossible.'); }
  };

  if (loading) {
    return <p style={{ fontFamily: "'Inter',sans-serif", color: 'rgba(180,170,200,0.6)' }}>Chargement…</p>;
  }

  const targetOptions = !draft ? [] : {
    work: (project?.books || []).map((w) => ({ value: String(w.id), label: `${w.type || 'Livre'} · ${w.title}` })),
    character: (project?.characters || []).map((c) => ({ value: String(c.id), label: c.name })),
    glossary: (project?.glossary || []).map((g) => ({ value: String(g.id), label: `${g.termKr}${g.romanization ? ` — ${g.romanization}` : ''}` })),
    libre: [],
  }[draft.kind] || [];

  const linked = draft && draft.kind !== 'libre';
  const inherited = linked ? ' (hérité du contenu lié si vide)' : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ width: 220 }}>
          <SelectField label="Biome de l'île" value={project?.mapBiome || 'plaines'} onChange={setBiome} options={BIOME_OPTIONS} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Button onClick={addZone}>+ Ajouter une zone</Button>
        </div>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)', marginBottom: 18 }}>
          Glisse un bâtiment pour le déplacer · clique pour l'éditer. La carte n'apparaît sur le site que si elle contient des zones.
        </p>
      </div>

      {err && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ff8898', marginBottom: 10 }}>{err}</p>}

      <div style={{ ...blockStyle, padding: '12px 16px' }}>
        <button
          type="button"
          onClick={() => setTerrainOpen((o) => !o)}
          style={{ ...blockLabel, marginBottom: terrainOpen ? 12 : 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}
        >
          {terrainOpen ? '▾' : '▸'} Terrain du monde (montagnes, rivières, lacs, forêts, biomes…)
        </button>
        {terrainOpen && (
          <>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.65)', marginBottom: 8, lineHeight: 1.6 }}>
              Décris le relief en JSON : <code>regions</code> (biome + hauteur), <code>rivers</code>, <code>lakes</code>, <code>forests</code>, <code>paths</code>, <code>waterLevel</code>, <code>seed</code>, et des biomes personnalisés via <code>biomes</code>. Schéma complet dans <code>docs/carte-3d.md</code>. Vide = île simple du biome de base.
            </p>
            <textarea
              value={terrainText}
              onChange={(e) => setTerrainText(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder='{ "regions": [{ "biome": "montagne", "cx": 8, "cz": -6, "r": 9, "height": 6 }] }'
              style={{
                width: '100%', background: 'rgba(8,5,18,0.8)', border: '1px solid rgba(80,50,130,0.28)',
                borderRadius: 8, padding: '12px 14px', color: '#ede8f8', outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.6, resize: 'vertical',
              }}
            />
            {terrainErr && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: '#ff8898', margin: '8px 0 0' }}>{terrainErr}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button onClick={applyTerrain}>Appliquer & enregistrer</Button>
              <Button variant="ghost" onClick={insertTemplate}>Insérer le modèle d'exemple</Button>
            </div>
          </>
        )}
      </div>

      <div style={{
        position: 'relative', height: 460, borderRadius: 14, overflow: 'hidden',
        border: `1px solid rgba(${ACC_RGB},0.25)`, background: '#0a0618', marginBottom: 18,
      }}>
        {zones.length === 0 && (
          <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none', fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.55)' }}>
            Île vide — ajoute une première zone pour commencer.
          </p>
        )}
        <Suspense fallback={<p style={{ padding: 20, fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.5)' }}>Chargement de la 3D…</p>}>
          <MapScene
            zones={zones}
            biomeKey={project?.mapBiome || 'plaines'}
            terrain={project?.mapTerrain || null}
            accent={project?.accentColor || ACC}
            quality="high"
            intro={false}
            dayMode={false}
            hoveredId={hoveredId}
            selectedId={selectedId}
            dimmedIds={new Set()}
            onHover={setHoveredId}
            onSelect={select}
            editable
            onZoneMove={moveZone}
            onZoneMoveEnd={moveEnd}
          />
        </Suspense>
      </div>

      {draft && selectedId != null ? (
        <div style={{ ...blockStyle, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ ...blockLabel, marginBottom: 0 }}>Zone sélectionnée</span>
            <DirtyBadge dirty={dirty} />
            <span style={{ flex: 1 }} />
            <Button onClick={saveDraft} disabled={!dirty}>Enregistrer</Button>
            <Button variant="danger" onClick={removeZone}>Supprimer</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SelectField
              label="Type de zone"
              value={draft.kind}
              onChange={(kind) => edit({ kind, targetId: null })}
              options={ZONE_KINDS}
            />
            {linked ? (
              <SelectField
                label="Contenu lié"
                value={draft.targetId == null ? '' : String(draft.targetId)}
                onChange={(v) => edit({ targetId: v ? Number(v) : null })}
                options={targetOptions}
                allowEmpty="— choisir —"
              />
            ) : <span />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <Field label={`Titre${inherited}`}><Input value={draft.title} onChange={(e) => edit({ title: e.target.value })} /></Field>
            <Field label={`Catégorie${linked ? ' (héritée si vide)' : ''}`}><Input value={draft.category} onChange={(e) => edit({ category: e.target.value })} placeholder="Livre, Cité, Article…" /></Field>
            <Field label="Date (texte libre)"><Input value={draft.date} onChange={(e) => edit({ date: e.target.value })} placeholder="An 412, mars 2026…" /></Field>
          </div>
          <Field label={`Sous-titre${inherited}`}><Input value={draft.subtitle} onChange={(e) => edit({ subtitle: e.target.value })} /></Field>
          <Field label={`Description (aperçu au survol)${inherited}`}>
            <Textarea value={draft.description} onChange={(e) => edit({ description: e.target.value })} rows={3} />
          </Field>
          <Field label="Contenu enrichi du panneau (Markdown)">
            <MarkdownField
              value={draft.content}
              onChange={(v) => edit({ content: v })}
              characters={project?.characters || []}
              glossary={project?.glossary || []}
              rows={6}
              placeholder="Lore, anecdotes, liens [label](/url)…"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <ImageUploadField label={`Image de couverture${inherited}`} value={draft.coverImage} onChange={(url) => edit({ coverImage: url })} aspect="16/9" />
            <div>
              <Field label={`Lien du bouton « Explorer »${linked ? ' (hérité si vide)' : ''}`}>
                <Input value={draft.link} onChange={(e) => edit({ link: e.target.value })} placeholder="/projets/ecriture/… ou https://…" />
              </Field>
              <GenreTags value={draft.tags} onChange={(tags) => edit({ tags })} />
            </div>
          </div>

          <div style={blockStyle}>
            <span style={blockLabel}>Apparence 3D</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {BUILDINGS.map((b) => {
                const on = draft.building === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => edit({ building: b.value })}
                    style={{
                      background: on ? `rgba(${ACC_RGB},0.18)` : 'transparent',
                      border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
                      color: on ? ACC : 'rgba(180,170,200,0.75)', borderRadius: 16,
                      padding: '5px 12px', cursor: 'pointer',
                      fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: on ? 700 : 400,
                    }}
                  >{b.label}</button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={`Taille — ${Number(draft.scale).toFixed(1)}×`}>
                <input type="range" min="0.5" max="2.2" step="0.1" value={draft.scale} onChange={(e) => edit({ scale: Number(e.target.value) })} style={{ width: '100%', accentColor: ACC }} />
              </Field>
              <Field label={`Rotation — ${Math.round((draft.rotation * 180) / Math.PI)}°`}>
                <input type="range" min={-Math.PI} max={Math.PI} step="0.05" value={draft.rotation} onChange={(e) => edit({ rotation: Number(e.target.value) })} style={{ width: '100%', accentColor: ACC }} />
              </Field>
            </div>
          </div>

          {zones.length > 1 && (
            <div style={blockStyle}>
              <span style={blockLabel}>Connexions vers d'autres zones</span>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: 'rgba(180,170,200,0.6)', marginBottom: 10 }}>
                🛣 route — chemin creusé dans le terrain (pont au-dessus de l'eau) · ✨ arc — ligne lumineuse. Re-clique sur le style pour basculer.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {zones.filter((z) => z.id !== selectedId).map((z) => {
                  const conn = (draft.connections || []).find((c) => c.to === z.id);
                  return (
                    <span key={z.id} style={{ display: 'inline-flex' }}>
                      <button
                        type="button"
                        onClick={() => edit({
                          connections: conn
                            ? draft.connections.filter((c) => c.to !== z.id)
                            : [...(draft.connections || []), { to: z.id, style: 'route' }],
                        })}
                        style={{
                          background: conn ? `rgba(${ACC_RGB},0.18)` : 'transparent',
                          border: `1px solid ${conn ? ACC : 'rgba(80,50,130,0.3)'}`,
                          borderRadius: conn ? '16px 0 0 16px' : 16,
                          color: conn ? ACC : 'rgba(180,170,200,0.75)',
                          padding: '5px 12px', cursor: 'pointer',
                          fontFamily: "'Inter',sans-serif", fontSize: 12,
                        }}
                      >{z.title || 'Sans titre'}</button>
                      {conn && (
                        <button
                          type="button"
                          title={conn.style === 'route' ? 'Route au sol — cliquer pour passer en arc lumineux' : 'Arc lumineux — cliquer pour passer en route'}
                          onClick={() => edit({
                            connections: draft.connections.map((c) => (c.to === z.id
                              ? { ...c, style: c.style === 'route' ? 'arc' : 'route' }
                              : c)),
                          })}
                          style={{
                            background: `rgba(${ACC_RGB},0.28)`, border: `1px solid ${ACC}`, borderLeft: 'none',
                            borderRadius: '0 16px 16px 0', color: ACC, padding: '5px 10px',
                            cursor: 'pointer', fontSize: 12,
                          }}
                        >{conn.style === 'route' ? '🛣' : '✨'}</button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        zones.length > 0 && (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>
            Clique sur un bâtiment de l'île pour éditer sa zone.
          </p>
        )
      )}
    </div>
  );
}
