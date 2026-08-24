import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { Button } from '../../admin/ui';
import { Modal } from '../../project/shared';
import { MUTED } from '../theme';
import { ItemForm, RaritiesManager, SetsManager } from './ItemForm';
import { ItemSheet } from './ItemSheet';
import { ItemsCatalog } from './ItemsCatalog';

// Onglet « Items » de /quetes : le catalogue, sa fiche et son éditeur.
// Il remplace l'ancienne liste d'items custom — c'est la même entité, vue
// enrichie (les objets déjà saisis s'y retrouvent tels quels).

export function ItemsTab({ byId, catalog, factions, canEdit, onOpenQuest, onChanged }) {
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [rarities, setRarities] = useState([]);
  const [sets, setSets] = useState([]);
  const [ficheId, setFicheId] = useState(null);
  const [edition, setEdition] = useState(null); // 'new' | fiche complète | null
  const [raretes, setRaretes] = useState(false);
  const [setsOuverts, setSetsOuverts] = useState(false);
  const [err, setErr] = useState(null);

  const charger = useCallback(async () => {
    const [list, rar, sts] = await Promise.all([
      api.quests.uniqueItems.list(),
      api.quests.rarities.list(),
      api.quests.sets.list(),
    ]);
    setItems(list);
    setRarities(rar);
    setSets(sts);
  }, []);

  useEffect(() => { charger().catch((e) => setErr(e.message)); }, [charger]);

  const rafraichir = useCallback(async () => {
    await charger();
    onChanged?.();
  }, [charger, onChanged]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const factionList = useMemo(() => [...factions.values()], [factions]);

  const editer = async (item) => {
    // La fiche de liste ne porte ni butin ni sources : on recharge la complète.
    const complet = await api.quests.uniqueItems.get(item.id);
    setFicheId(null);
    setEdition(complet);
  };

  const supprimer = async (item) => {
    const ok = await confirm({
      title: "Supprimer l'item unique", danger: true, confirmLabel: 'Supprimer',
      message: `« ${item.nom} » et sa table de butin seront supprimés. Les lignes de quêtes qui l'utilisent gardent leur libellé mais perdent le lien.`,
    });
    if (!ok) return;
    await api.quests.uniqueItems.remove(item.id);
    setEdition(null);
    setFicheId(null);
    await rafraichir();
  };

  if (edition) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Button variant="ghost" onClick={() => setEdition(null)}>← Retour au catalogue</Button>
          {edition !== 'new' && (
            <Button variant="danger" onClick={() => supprimer(edition)} style={{ marginLeft: 'auto' }}>
              Supprimer
            </Button>
          )}
        </div>
        <ItemForm
          item={edition === 'new' ? null : edition}
          items={items} rarities={rarities} sets={sets} factions={factionList}
          byId={byId} catalog={catalog}
          onDone={async (saved) => { setEdition(null); await rafraichir(); setFicheId(saved.id); }}
          onCancel={() => setEdition(null)}
        />
      </div>
    );
  }

  return (
    <div>
      {err && <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err}</p>}

      {raretes && canEdit && (
        <div style={{ marginBottom: 14 }}>
          <RaritiesManager rarities={rarities} onChanged={rafraichir} onClose={() => setRaretes(false)} />
        </div>
      )}

      {setsOuverts && canEdit && (
        <div style={{ marginBottom: 14 }}>
          <SetsManager sets={sets} onChanged={rafraichir} onClose={() => setSetsOuverts(false)} />
        </div>
      )}

      <ItemsCatalog
        items={items} rarities={rarities} sets={sets} factions={factionList}
        byId={byId} canEdit={canEdit}
        onOpen={setFicheId}
        onCreate={() => setEdition('new')}
        onEditRarities={() => setRaretes((r) => !r)}
        onEditSets={() => setSetsOuverts((v) => !v)}
      />

      <Modal open={ficheId != null} onClose={() => setFicheId(null)} title="" width={780}>
        {ficheId != null ? (
          <ItemSheet
            itemId={ficheId} byId={byId} itemsById={itemsById} catalog={catalog} canEdit={canEdit}
            items={items}
            onOpenItem={setFicheId}
            onOpenQuest={(id) => { setFicheId(null); onOpenQuest?.(id); }}
            onEdit={editer}
            onChanged={rafraichir}
          />
        ) : <p style={{ color: MUTED }}>Chargement…</p>}
      </Modal>
    </div>
  );
}
