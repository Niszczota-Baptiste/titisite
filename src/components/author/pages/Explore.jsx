import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { VARIATION_AXES, addDays, isoDay, pickOldIdea, pickPair, pickQuestion, pickVariation, trailAsNote } from '../explore.js';
import { KIND_ORDER, kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import { Btn, Empty, entityPath, humanError } from '../ui';

// Explorer : quatre sortes de pistes, proposées à la demande à partir des
// éléments du projet. Rien n'est calculé par un service extérieur (ni IA ni
// abonnement) : des gabarits locaux et tes propres fiches. Une piste n'est
// qu'une piste — elle ne crée ni relation, ni fait, ni modification ; « Garder »
// la range dans la boîte à idées, étiquetée comme telle.

function EntityChip({ pid, entity }) {
  const m = kindMeta(entity.kind);
  return <Link className="au-chip" to={entityPath(pid, entity)}>{entity.icon || m.icon} {entity.title}</Link>;
}

function Trail({ title, icon, trail, empty, onNext, children }) {
  return (
    <section className="au-card au-trail">
      <div className="au-card-title">
        <span aria-hidden>{icon}</span> {title}
        <span className="au-pill au-trail-pill" title="Une piste à explorer, pas un fait du récit">piste</span>
        <span className="au-actions"><Btn size="small" variant="ghost" onClick={onNext}>Autre piste</Btn></span>
      </div>
      {trail ? children : <p className="au-faint" style={{ margin: 0 }}>{empty}</p>}
    </section>
  );
}

export function Explore() {
  const { pid, P, index, version, bump, reloadTags } = useAuthor();
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [seed, setSeed] = useState({ idea: 0, pair: 0, question: 0, variation: 0 });
  const [seenIdeas, setSeenIdeas] = useState([]);
  const [axis, setAxis] = useState(null);
  const [kept, setKept] = useState({});
  useShellPage({ crumbs: [{ label: 'Explorer' }], title: 'Explorer' });

  useEffect(() => {
    // Mêmes appels que les pages Idées et Graphe : servis par la copie hors connexion.
    P.entities.list({ kind: 'note', sort: 'position', limit: 1000 }).then((r) => setNotes(r.items)).catch(() => setNotes([]));
    P.graph({ kinds: KIND_ORDER.join(',') }).then((g) => setEdges(g.edges || [])).catch(() => setEdges([]));
  }, [P, version]);

  const scenes = useMemo(() => index.filter((e) => e.kind === 'chapter' || e.kind === 'event'), [index]);
  const characters = useMemo(() => index.filter((e) => e.kind === 'character'), [index]);
  const targets = useMemo(() => index.filter((e) => e.kind === 'chapter' || e.kind === 'sound'), [index]);

  const today = isoDay(new Date());
  // Un nouveau tirage seulement quand on le demande (`seed`).
  const idea = useMemo(() => pickOldIdea(notes, { today, nowS: Math.floor(Date.now() / 1000), exclude: seenIdeas }), [notes, seed.idea]);
  const pair = useMemo(() => pickPair(index, edges), [index, edges, seed.pair]);
  const question = useMemo(() => pickQuestion(scenes, characters), [scenes, characters, seed.question]);
  const variation = useMemo(() => pickVariation(targets, characters, { axis }), [targets, characters, seed.variation, axis]);

  const next = (key) => { setKept((k) => ({ ...k, [key]: false })); setSeed((s) => ({ ...s, [key]: s[key] + 1 })); };

  const keep = useCallback(async (key, trail) => {
    try {
      const res = await P.notes.quick(trailAsNote(trail), ['piste'], undefined, { origin: 'explorer' });
      setKept((k) => ({ ...k, [key]: true }));
      bump();
      reloadTags();
      toast.success(res?.queued ? 'Piste gardée sur l\'appareil — envoyée au retour du réseau' : 'Piste gardée dans la boîte à idées (étiquette « piste »)');
    } catch (err) { toast.error(humanError(err)); }
  }, [P, bump, reloadTags, toast]);

  const later = async (note, days) => {
    try {
      const full = await P.entities.get(note.id);
      await P.entities.update(note.id, { revision: full.revision, revisitOn: addDays(today, days) });
      toast.success(`Remise à plus tard : elle reviendra dans ${days >= 60 ? `${Math.round(days / 30)} mois` : `${days} jours`}`);
      setSeenIdeas((s) => [...s, note.id]);
      bump();
      next('idea');
    } catch (err) { toast.error(humanError(err)); }
  };

  const keepBtn = (key, trail) => (kept[key]
    ? <span className="au-faint">✓ gardée</span>
    : <Btn size="small" onClick={() => keep(key, trail)}>Garder cette piste</Btn>);

  if (index.length === 0 && notes.length === 0) {
    return (
      <div className="au-page is-narrow">
        <Empty icon="🧭" title="Rien à explorer pour l'instant">
          Capture quelques idées, crée un personnage ou un chapitre : les pistes naissent de tes propres éléments.
        </Empty>
      </div>
    );
  }

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head">
        <div>
          <h1>🧭 Explorer</h1>
          <p className="au-sub">Des pistes tirées de tes propres éléments. Elles ne changent rien au projet : garde celles qui te parlent, laisse les autres.</p>
        </div>
      </div>

      <Trail title="Une ancienne idée à reprendre" icon="💡" trail={idea} onNext={() => { if (idea) setSeenIdeas((s) => [...s, idea.entity.id]); next('idea'); }}
        empty="Aucune idée en attente depuis longtemps.">
        {idea && (
          <>
            <p className="au-trail-text"><Link to={entityPath(pid, { ...idea.entity, kind: 'note' })}>{idea.entity.title}</Link></p>
            {idea.entity.summary && <p className="au-muted au-trail-sub">{idea.entity.summary}</p>}
            <p className="au-faint au-trail-sub">{idea.reason}</p>
            <div className="au-trail-actions">
              <Link className="au-btn is-small is-primary" to={entityPath(pid, { ...idea.entity, kind: 'note' })}>La rouvrir</Link>
              <Btn size="small" onClick={() => later(idea.entity, 30)}>À revoir dans un mois</Btn>
              <Btn size="small" variant="ghost" onClick={() => later(idea.entity, 90)}>Dans trois mois</Btn>
            </div>
          </>
        )}
      </Trail>

      <Trail title="Deux éléments à rapprocher" icon="🔗" trail={pair} onNext={() => next('pair')}
        empty="Il faut au moins deux éléments pas encore reliés.">
        {pair && (
          <>
            <p className="au-trail-text">{pair.prompt}</p>
            <div className="au-trail-actions">
              <EntityChip pid={pid} entity={pair.a} /><EntityChip pid={pid} entity={pair.b} />
              {keepBtn('pair', pair)}
            </div>
            <p className="au-faint au-trail-sub">Aucune relation n&apos;est créée : si le rapprochement tient, tu la poseras toi-même sur l&apos;une des fiches.</p>
          </>
        )}
      </Trail>

      <Trail title="Une question pour une scène" icon="❓" trail={question} onNext={() => next('question')}
        empty="Crée un chapitre ou un événement pour recevoir des questions.">
        {question && (
          <>
            <p className="au-trail-text">{question.prompt}</p>
            <div className="au-trail-actions">
              <EntityChip pid={pid} entity={question.entity} />
              {question.about && <EntityChip pid={pid} entity={question.about} />}
              {keepBtn('question', question)}
            </div>
          </>
        )}
      </Trail>

      <Trail title="Une variation" icon="🎲" trail={variation} onNext={() => next('variation')}
        empty="Crée un chapitre ou une idée musicale pour essayer des variations.">
        {variation && (
          <>
            <div className="au-seg" role="group" aria-label="Sorte de variation" style={{ marginBottom: 10 }}>
              <button type="button" className={axis === null ? 'is-on' : undefined} onClick={() => setAxis(null)}>Au hasard</button>
              {VARIATION_AXES.map((a) => (
                <button key={a} type="button" className={axis === a ? 'is-on' : undefined} onClick={() => setAxis(a)}>{a[0].toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
            <p className="au-trail-text">{variation.prompt}</p>
            <div className="au-trail-actions">
              <EntityChip pid={pid} entity={variation.entity} />
              {keepBtn('variation', variation)}
            </div>
            <p className="au-faint au-trail-sub">Pour essayer sans rien écraser : dans l&apos;éditeur, sélectionne le passage puis « Variante ».</p>
          </>
        )}
      </Trail>
    </div>
  );
}
