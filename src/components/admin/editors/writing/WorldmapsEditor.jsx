import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../api/client';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { paintWorld } from '../../../writing/map/Map2D';
import { MARKER_BY_KEY, MARKERS, ZONE_KINDS } from '../../../writing/map/presets';
import { buildWorld } from '../../../writing/map/terrain';
import { ACC, ACC_RGB, Button, Field, Input, Textarea } from '../../ui';
import { ImageUploadField } from '../../ImageUploadField';
import { TerrainPainter } from './TerrainPainter';
import { DirtyBadge, GenreTags, MarkdownField, SelectField, blockLabel, blockStyle } from './widgets';

// Admin editor of the giant 2D world maps (« cartes-mondes ») : create one
// atlas per dimension/continent, paint its macro terrain with the shared
// brush, then drop POI markers straight on the map. POI link works (cités,
// régions… → their reader page carries the local voxel map), characters,
// glossary terms, or stay free-form.

const draftOf = (z) => ({
  kind: z.kind, targetId: z.targetId, marker: z.marker || 'lieu',
  title: z.title, subtitle: z.subtitle, description: z.description, content: z.content,
  coverImage: z.coverImage, category: z.category, tags: z.tags || [], date: z.date, link: z.link,
  connections: (z.connections || []).map((c) => (typeof c === 'number' ? { to: c, style: 'route' } : c)),
});

export function WorldmapsEditor({ projectId }) {
  const confirm = useConfirm();
  const [project, setProject] = useState(null);
  const [maps, setMaps] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [zones, setZones] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [paintOpen, setPaintOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [terrainVersion, setTerrainVersion] = useState(0);

  const active = maps.find((m) => m.id === activeId) || null;
  const zonesApi = useMemo(() => (activeId ? api.writing.worldmaps.zonesFor(activeId) : null), [activeId]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.writing.projects.get(projectId), api.writing.worldmaps.listFor(projectId)])
      .then(([p, ms]) => {
        if (!alive) return;
        setProject(p);
        setMaps(ms);
        setActiveId(ms[0]?.id ?? null);
        setLoading(false);
      })
      .catch(() => { if (alive) { setErr('Chargement impossible.'); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    if (!zonesApi) { setZones([]); return; }
    let alive = true;
    zonesApi.list().then((zs) => { if (alive) { setZones(zs); setSelectedId(null); setDraft(null); } }).catch(() => {});
    return () => { alive = false; };
  }, [zonesApi]);

  const select = useCallback((id) => {
    setSelectedId(id);
    setDirty(false);
    setErr('');
    const z = zones.find((x) => x.id === id);
    setDraft(z ? draftOf(z) : null);
  }, [zones]);

  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  const createMap = async () => {
    try {
      const wm = await api.writing.worldmaps.createFor(projectId, { name: `Monde ${maps.length + 1}` });
      setMaps((ms) => [...ms, wm]);
      setActiveId(wm.id);
    } catch { setErr('Création impossible.'); }
  };

  const renameMap = async (name) => {
    setMaps((ms) => ms.map((m) => (m.id === activeId ? { ...m, name } : m)));
    try { await api.writing.worldmaps.update(activeId, { name }); }
    catch { setErr('Renommage impossible.'); }
  };

  const removeMap = async () => {
    if (!active) return;
    const ok = await confirm({
      title: 'Supprimer cette carte-monde',
      message: `« ${active.name} » et tous ses points d'intérêt seront supprimés.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.writing.worldmaps.remove(active.id);
      const rest = maps.filter((m) => m.id !== active.id);
      setMaps(rest);
      setActiveId(rest[0]?.id ?? null);
    } catch { setErr('Suppression impossible.'); }
  };

  const saveTerrain = async (terrain) => {
    setSaving(true);
    setErr('');
    try {
      const wm = await api.writing.worldmaps.update(activeId, { terrain });
      setMaps((ms) => ms.map((m) => (m.id === wm.id ? wm : m)));
      setTerrainVersion((v) => v + 1);
    } catch (e) {
      setErr(e?.body?.error === 'terrain_too_large' ? 'Carte trop volumineuse (max 1,5 Mo).' : 'Enregistrement impossible.');
    } finally { setSaving(false); }
  };

  const addPoi = async () => {
    try {
      const z = await zonesApi.create({ kind: 'libre', title: 'Nouveau lieu', marker: 'lieu', x: 0, z: 0 });
      setZones((zs) => [...zs, z]);
      setSelectedId(z.id);
      setDraft(draftOf(z));
      setDirty(false);
    } catch { setErr('Création impossible.'); }
  };

  const movePoi = useCallback((id, x, z) => {
    setZones((zs) => zs.map((zone) => (zone.id === id ? { ...zone, x, z } : zone)));
  }, []);
  const movePoiEnd = useCallback((id) => {
    setZones((zs) => {
      const zone = zs.find((z) => z.id === id);
      if (zone) zonesApi.update(id, { x: zone.x, z: zone.z }).catch(() => setErr('Position non enregistrée.'));
      return zs;
    });
  }, [zonesApi]);

  const saveDraft = async () => {
    if (!draft || selectedId == null) return;
    setErr('');
    try {
      const z = await zonesApi.update(selectedId, draft);
      setZones((zs) => zs.map((x) => (x.id === z.id ? z : x)));
      setDraft(draftOf(z));
      setDirty(false);
    } catch (e) {
      setErr(e?.body?.error === 'invalid_target' ? 'Choisis un contenu à lier (ou passe le lieu en « libre »).' : 'Enregistrement impossible.');
    }
  };

  const removePoi = async () => {
    const zone = zones.find((z) => z.id === selectedId);
    if (!zone) return;
    const ok = await confirm({
      title: 'Supprimer ce lieu',
      message: `« ${zone.title || 'Sans titre'} » disparaîtra de la carte-monde.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await zonesApi.remove(zone.id);
      setZones((zs) => zs.filter((z) => z.id !== zone.id));
      select(null);
    } catch { setErr('Suppression impossible.'); }
  };

  if (loading) return <p style={{ fontFamily: "'Inter',sans-serif", color: 'rgba(180,170,200,0.6)' }}>Chargement…</p>;

  const chip = (on) => ({
    background: on ? `rgba(${ACC_RGB},0.18)` : 'transparent',
    border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
    color: on ? ACC : 'rgba(180,170,200,0.75)', borderRadius: 16,
    padding: '5px 12px', cursor: 'pointer',
    fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: on ? 700 : 400,
  });

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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {maps.map((m) => (
          <button key={m.id} type="button" style={chip(m.id === activeId)} onClick={() => setActiveId(m.id)}>{m.name}</button>
        ))}
        <Button variant="ghost" onClick={createMap}>+ Nouvelle carte-monde</Button>
      </div>

      {err && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ff8898', marginBottom: 10 }}>{err}</p>}

      {!active && (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.65)', lineHeight: 1.7 }}>
          Crée la première carte-monde de l'univers : un atlas 2D géant (jusqu'à
          ~30 000 blocs de côté) que les visiteurs explorent en glissant/zoomant.
          Chaque point d'intérêt ouvre la page de lore du lieu — qui peut porter
          sa propre carte voxel locale.
        </p>
      )}

      {active && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ width: 240 }}>
              <Field label="Nom de la carte-monde">
                <Input value={active.name} onChange={(e) => renameMap(e.target.value)} />
              </Field>
            </div>
            <div style={{ marginBottom: 14, display: 'flex', gap: 8 }}>
              <Button onClick={addPoi}>+ Ajouter un lieu</Button>
              <Button variant="danger" onClick={removeMap}>Supprimer la carte</Button>
            </div>
          </div>

          <div style={{ ...blockStyle, padding: '12px 16px' }}>
            <button
              type="button"
              onClick={() => setPaintOpen((o) => !o)}
              style={{ ...blockLabel, marginBottom: paintOpen ? 12 : 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}
            >
              {paintOpen ? '▾' : '▸'} Terrain du monde (pinceau macro — biomes Minecraft, relief, mers…)
            </button>
            {paintOpen && (
              <TerrainPainter
                key={`${active.id}-${terrainVersion}`}
                terrain={active.terrain || null}
                baseBiome="plaines"
                accent={project?.accentColor || ACC}
                saving={saving}
                onSave={saveTerrain}
                world
              />
            )}
          </div>

          <PoiBoard
            worldmap={active}
            zones={zones}
            accent={project?.accentColor || ACC}
            selectedId={selectedId}
            onSelect={select}
            onMove={movePoi}
            onMoveEnd={movePoiEnd}
          />

          {draft && selectedId != null ? (
            <div style={{ ...blockStyle, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ ...blockLabel, marginBottom: 0 }}>Lieu sélectionné</span>
                <DirtyBadge dirty={dirty} />
                <span style={{ flex: 1 }} />
                <Button onClick={saveDraft} disabled={!dirty}>Enregistrer</Button>
                <Button variant="danger" onClick={removePoi}>Supprimer</Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <SelectField label="Type de lieu" value={draft.kind} onChange={(kind) => edit({ kind, targetId: null })} options={ZONE_KINDS} />
                {linked ? (
                  <SelectField
                    label="Contenu lié"
                    value={draft.targetId == null ? '' : String(draft.targetId)}
                    onChange={(v) => edit({ targetId: v ? Number(v) : null })}
                    options={targetOptions}
                    allowEmpty="— choisir —"
                  />
                ) : <span />}
                <SelectField label="Marqueur" value={draft.marker} onChange={(marker) => edit({ marker })} options={MARKERS} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <Field label={`Titre${inherited}`}><Input value={draft.title} onChange={(e) => edit({ title: e.target.value })} /></Field>
                <Field label={`Catégorie${linked ? ' (héritée si vide)' : ''}`}><Input value={draft.category} onChange={(e) => edit({ category: e.target.value })} placeholder="Royaume, Cité…" /></Field>
                <Field label="Date (texte libre)"><Input value={draft.date} onChange={(e) => edit({ date: e.target.value })} placeholder="An 412…" /></Field>
              </div>
              <Field label={`Description (aperçu au survol)${inherited}`}>
                <Textarea value={draft.description} onChange={(e) => edit({ description: e.target.value })} rows={3} />
              </Field>
              <Field label="Contenu enrichi du panneau (Markdown)">
                <MarkdownField
                  value={draft.content}
                  onChange={(v) => edit({ content: v })}
                  characters={project?.characters || []}
                  glossary={project?.glossary || []}
                  rows={5}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
                <ImageUploadField label={`Image de couverture${inherited}`} value={draft.coverImage} onChange={(url) => edit({ coverImage: url })} aspect="16/9" />
                <div>
                  <Field label={`Lien d'exploration${linked ? ' (hérité si vide — page du lieu)' : ''}`}>
                    <Input value={draft.link} onChange={(e) => edit({ link: e.target.value })} placeholder="/projets/ecriture/… ou https://…" />
                  </Field>
                  <GenreTags value={draft.tags} onChange={(tags) => edit({ tags })} />
                </div>
              </div>

              {zones.length > 1 && (
                <div style={blockStyle}>
                  <span style={blockLabel}>Connexions (routes 🛣 / arcs ✨ vers d'autres lieux)</span>
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
                            style={{ ...chip(Boolean(conn)), borderRadius: conn ? '16px 0 0 16px' : 16 }}
                          >{z.title || 'Sans titre'}</button>
                          {conn && (
                            <button
                              type="button"
                              onClick={() => edit({
                                connections: draft.connections.map((c) => (c.to === z.id
                                  ? { ...c, style: c.style === 'route' ? 'arc' : 'route' } : c)),
                              })}
                              style={{ background: `rgba(${ACC_RGB},0.28)`, border: `1px solid ${ACC}`, borderLeft: 'none', borderRadius: '0 16px 16px 0', color: ACC, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
                            >{conn.style === 'route' ? '🛣' : '✨'}</button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : zones.length > 0 && (
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>
              Clique sur un marqueur pour éditer son lieu, ou glisse-le pour le déplacer.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// The interactive 2D board: macro terrain + draggable POI markers.
function PoiBoard({ worldmap, zones, accent, selectedId, onSelect, onMove, onMoveEnd }) {
  const canvas = useRef(null);
  const boardRef = useRef(null);
  const drag = useRef(null);

  const world = useMemo(
    () => buildWorld(worldmap.terrain, 'plaines', zones, { world: true }),
    [worldmap.terrain, zones],
  );

  useEffect(() => {
    if (canvas.current) paintWorld(canvas.current, world, accent, { px: world.grid > 160 ? 1 : 6 });
  }, [world, accent]);

  const G = world.grid;
  const pos = (x, z) => ({ left: `${((x + G / 2) / G) * 100}%`, top: `${((z + G / 2) / G) * 100}%` });

  const toWorld = (e) => {
    const r = boardRef.current.getBoundingClientRect();
    const half = G / 2;
    return [
      Math.min(half, Math.max(-half, ((e.clientX - r.left) / r.width) * G - half)),
      Math.min(half, Math.max(-half, ((e.clientY - r.top) / r.height) * G - half)),
    ];
  };

  return (
    <div
      ref={boardRef}
      onPointerMove={(e) => {
        if (drag.current == null) return;
        const [x, z] = toWorld(e);
        onMove(drag.current, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
      }}
      onPointerUp={() => {
        if (drag.current != null) onMoveEnd(drag.current);
        drag.current = null;
      }}
      style={{
        position: 'relative', width: 'min(640px, 100%)', aspectRatio: '1',
        borderRadius: 14, overflow: 'hidden', border: `1px solid rgba(${ACC_RGB},0.25)`,
        marginBottom: 18, touchAction: 'none', background: '#0a1420',
      }}
    >
      <canvas ref={canvas} aria-hidden style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
      {zones.map((z) => {
        const m = MARKER_BY_KEY[z.marker] || MARKER_BY_KEY.lieu;
        const lit = selectedId === z.id;
        return (
          <button
            key={z.id}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = z.id;
              onSelect(z.id);
            }}
            onPointerUp={() => { if (drag.current != null) onMoveEnd(drag.current); drag.current = null; }}
            aria-label={z.title}
            style={{
              position: 'absolute', ...pos(z.x, z.z), transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', cursor: 'grab', padding: 4, zIndex: lit ? 5 : 2,
              touchAction: 'none',
            }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: '50%', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(11,6,32,0.88)',
              border: `2px solid ${lit ? accent : `rgba(${ACC_RGB},0.55)`}`,
              boxShadow: lit ? `0 0 12px rgba(${ACC_RGB},0.9)` : '0 2px 8px rgba(0,0,0,0.6)',
            }}>{m.icon}</span>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, whiteSpace: 'nowrap',
              color: lit ? accent : '#ede8f8', background: 'rgba(8,5,20,0.78)',
              border: `1px solid rgba(${ACC_RGB},${lit ? 0.55 : 0.2})`,
              borderRadius: 6, padding: '0 5px',
            }}>{z.title}</span>
          </button>
        );
      })}
    </div>
  );
}
