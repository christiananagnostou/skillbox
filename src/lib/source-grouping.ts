/**
 * Shared utilities for grouping items by source type.
 */

/**
 * Groups items by a key into a Map.
 */
export function groupByKey<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Sorts group keys according to a predefined order, with unknown keys sorted alphabetically at the end.
 */
export function sortGroupKeys(keys: string[], keyOrder: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aIndex = keyOrder.indexOf(a);
    const bIndex = keyOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Groups items by a key, sorts groups by a predefined order, and sorts items within each group.
 */
export function groupAndSort<T>(
  items: T[],
  getKey: (item: T) => string,
  keyOrder: string[],
  sortItems: (a: T, b: T) => number
): Array<{ key: string; items: T[] }> {
  const groups = groupByKey(items, getKey);
  const sortedKeys = sortGroupKeys(Array.from(groups.keys()), keyOrder);

  return sortedKeys.map((key) => ({
    key,
    items: (groups.get(key) ?? []).sort(sortItems),
  }));
}

/**
 * Default sort function for items with a name property.
 */
export function sortByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}
