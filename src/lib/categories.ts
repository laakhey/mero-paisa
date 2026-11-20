type Pickable = { id: number; name: string };

export const QUICK_CATEGORY_COUNT = 4;

/**
 * Splits a most-used-first list for the category picker: the quick picks shown
 * as chips, and the search matches among everything else.
 *
 * The current selection is always kept visible, so choosing a category from
 * search (or editing an old transaction) never leaves the picker looking empty.
 */
export function splitCategories<T extends Pickable>(
  byUsage: T[],
  selectedId: number | null,
  query: string,
  quickCount = QUICK_CATEGORY_COUNT
): { quick: T[]; matches: T[]; hasMore: boolean } {
  const quick = byUsage.slice(0, quickCount);
  const selected = byUsage.find((category) => category.id === selectedId);
  if (selected && !quick.includes(selected)) quick.push(selected);

  const needle = query.trim().toLowerCase();
  const rest = byUsage.filter((category) => !quick.includes(category));
  const matches = needle ? rest.filter((category) => category.name.toLowerCase().includes(needle)) : [];

  return { quick, matches, hasMore: rest.length > 0 };
}
