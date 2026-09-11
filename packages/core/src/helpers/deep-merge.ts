export function deepMerge<T>(base: T, override?: Partial<T>): T {
  if (!override) return base;

  // `base` may be undefined: an override can introduce a nested object under a
  // key the base does not define at all (e.g. a module package namespacing its
  // own config). Spreading undefined is fine; indexing it is not.
  const baseRecord = base as Record<string, unknown> | undefined;
  const result = { ...base } as Record<string, unknown>;

  for (const key in override) {
    const value = override[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(baseRecord?.[key] as T, value as Partial<T>);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}
