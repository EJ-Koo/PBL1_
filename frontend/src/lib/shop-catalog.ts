type CatalogItem = { id: string; effect?: { type?: unknown } | null };

/**
 * Cancelled items can still be returned by the server for owners, including
 * after sale is disabled. Exclude them from the shared shop view so neither
 * cached ownership nor equipped status can bring the cancelled feature back.
 */
export function visibleShopItems<T extends CatalogItem>(items: readonly T[]): T[] {
  return items.filter((item) => item.id !== 'milky_way' && item.effect?.type !== 'milky_way');
}
