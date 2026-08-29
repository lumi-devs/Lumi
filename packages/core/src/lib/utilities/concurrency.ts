/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * Unbounded `Promise.all` over a guild collection would issue thousands of
 * simultaneous Discord API calls and trip rate limits, so work is pulled from a
 * shared cursor by a fixed pool instead.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        await fn(items[cursor++]!);
      }
    }),
  );
}
