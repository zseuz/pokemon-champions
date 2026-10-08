import { COMMON_ITEMS, metaItems } from '../models/analysis/items';
/** Controlador de la vista function ItemsView: estado y lógica, sin interfaz. */
import { useMemo, useState } from 'react';
import { type Format } from '../models/data/meta';
import { getItem } from '../models/domain/dex';
import { assignItems } from '../models/analysis/items';
import { type PokemonSet } from '../models/domain/sets';
import { setFor, type BoxEntry } from '../models/repository/store';

export function useItemsController({ format, team, box, inventory, setInventory }: { format: Format; team: PokemonSet[]; box: BoxEntry[]; inventory: string[]; setInventory: (i: string[]) => void }) {
  const [adding, setAdding] = useState('');
  const result = useMemo(() => (team.length && inventory.length ? assignItems(team, inventory, format) : null), [team, inventory, format]);

  const addItems = (items: string[]) => setInventory([...new Set([...inventory, ...items.filter((i) => getItem(i))])].sort());
  const stones = [...team, ...box.map((b) => setFor(b, format))].map((s) => s.item).filter((i) => /ite( [XYZ])?$/.test(i));

  const addCommon = () => addItems(COMMON_ITEMS);
  const addMeta = () => addItems(metaItems(format));

  return { addCommon, addMeta, adding, setAdding, result, addItems, stones };
}
