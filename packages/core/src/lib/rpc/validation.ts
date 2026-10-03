export function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** For cursor-only keyset lists (no page number): just resolves the page size to a `take`. */
export function resolvePageSize(filter: { pageSize?: number }) {
  const pageSize = filter.pageSize ?? 25;
  return { pageSize, take: pageSize };
}
