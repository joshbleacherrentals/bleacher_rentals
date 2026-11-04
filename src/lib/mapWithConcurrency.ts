/**
 * Like `Promise.all(items.map(fn))`, but with at most `limit` calls running at once, so a long
 * list of API calls does not go out as one burst. Results keep the order of `items`. The first
 * rejection rejects the whole thing, as `Promise.all` does — catch inside `fn` to tolerate failures.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}
