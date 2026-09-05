import "server-only";

const ExportPageSize = 100;
// A hard stop against looping forever on a guild with an enormous log -
// 50 * 100 = 5,000 records is generous for a normal server's history.
const ExportMaxPages = 50;

/**
 * Walks every page of a paginated RPC list endpoint and concatenates the
 * results, for "download the whole (filtered) log" actions - the dashboard
 * UI only ever renders one page at a time, but an export needs all of them.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= ExportMaxPages; page++) {
    const { items, total } = await fetchPage(page, ExportPageSize);
    results.push(...items);
    if (items.length === 0 || results.length >= total) break;
  }
  return results;
}
