export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const width = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        const item = items[index]!;
        results[index] = await map(item, index);
      }
    }),
  );

  return results;
}
