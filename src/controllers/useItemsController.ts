import { COMMON_ITEMS, itemName, metaItems } from '../models/analysis/items';
import type { PickerOption } from './viewModels';
/** Controlador de la vista function ItemsView: estado y lógica, sin interfaz. */
import { useMemo } from 'react';
import { type Format } from '../models/data/meta';
import { ALL_ITEMS, getItem, isMegaStone } from '../models/domain/dex';
import { itemEs, searchKey } from '../models/domain/es';
import { assignItems } from '../models/analysis/items';
import { type PokemonSet } from '../models/domain/sets';
import { setFor, type BoxEntry } from '../models/repository/store';

export function useItemsController({ format, team, box, inventory, setInventory }: { format: Format; team: PokemonSet[]; box: BoxEntry[]; inventory: string[]; setInventory: (i: string[]) => void }) {
  const result = useMemo(() => (team.length && inventory.length ? assignItems(team, inventory, format) : null), [team, inventory, format]);

  const addItems = (items: string[]) => setInventory([...new Set([...inventory, ...items.filter((i) => getItem(i))])].sort());
  const stones = [...team, ...box.map((b) => setFor(b, format))].map((s) => s.item).filter((i) => /ite( [XYZ])?$/.test(i));

  /** Todos los objetos del juego en una lista con grupos; los que ya tienes salen marcados y no se pueden repetir. */
  const options = useMemo<PickerOption[]>(() => {
    const have = new Set(inventory);
    const meta = new Set(metaItems(format));
    const common = new Set(COMMON_ITEMS);
    const groupOf = (i: string) => (isMegaStone(i) ? 'Megapiedras' : /Berry$/.test(i) ? 'Bayas' : meta.has(i) || common.has(i) ? 'Habituales del meta' : 'Otros objetos');
    const rank = ['Habituales del meta', 'Megapiedras', 'Bayas', 'Otros objetos'];
    return ALL_ITEMS
      .map((i) => ({ value: i, label: itemName(i), group: groupOf(i), disabled: have.has(i), detail: have.has(i) ? 'Ya lo tienes en tu inventario' : undefined, search: searchKey(i, itemEs(i)) }))
      .sort((a, b) => rank.indexOf(a.group) - rank.indexOf(b.group));
  }, [inventory, format]);

  const addCommon = () => addItems(COMMON_ITEMS);
  const addMeta = () => addItems(metaItems(format));

  return { addCommon, addMeta, options, result, addItems, stones };
}
