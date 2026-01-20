export type GroupedNames = {
  key: string;
  skills: string[];
};

export type GroupedStatus = {
  key: string;
  outdated: string[];
  upToDate: string[];
};

export function groupNamesByKey<T>(
  items: T[],
  nameOf: (item: T) => string,
  keysOf: (item: T) => string[]
): GroupedNames[] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const name = nameOf(item);
    for (const key of keysOf(item)) {
      const existing = map.get(key) ?? [];
      if (!existing.includes(name)) {
        existing.push(name);
        map.set(key, existing);
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, skills]) => ({ key, skills: skills.sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function groupStatusByKey<T>(
  items: T[],
  nameOf: (item: T) => string,
  outdatedOf: (item: T) => boolean,
  keysOf: (item: T) => string[]
): GroupedStatus[] {
  const map = new Map<string, GroupedStatus>();
  for (const item of items) {
    const name = nameOf(item);
    const isOutdated = outdatedOf(item);
    for (const key of keysOf(item)) {
      const entry = map.get(key) ?? { key, outdated: [], upToDate: [] };
      if (isOutdated) {
        entry.outdated.push(name);
      } else {
        entry.upToDate.push(name);
      }
      map.set(key, entry);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}
