/**
 * Generic registry factory.
 *
 * Parses a Vite eager glob of modules, auto-registers entries whose
 * export names end with `suffix` and have `id` + `FeedTab` fields,
 * and returns typed get / getAll / ORDER helpers.
 */
export function createRegistry<T extends { id: string }>(
  glob: Record<string, Record<string, T>>,
  suffix: string,
  order: readonly string[],
) {
  const registry = new Map<string, T>();

  for (const [, mod] of Object.entries(glob)) {
    for (const [exportName, value] of Object.entries(mod)) {
      if (
        exportName.endsWith(suffix) &&
        value &&
        typeof value === "object" &&
        "id" in value &&
        "FeedTab" in value
      ) {
        registry.set(value.id, value);
      }
    }
  }

  function get(id: string): T | undefined {
    return registry.get(id);
  }

  function getAll(): T[] {
    const known = order.filter((id) => registry.has(id)).map((id) => registry.get(id)!);
    const unknown = Array.from(registry.values())
      .filter((item) => !order.includes(item.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    return [...known, ...unknown];
  }

  return { get, getAll, ORDER: order } as const;
}
