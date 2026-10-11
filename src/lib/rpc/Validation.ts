export function resolvePageSize(filter: { pageSize?: number }) {
  const pageSize = filter.pageSize ?? 25;
  return { pageSize, take: pageSize };
}

export function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const { pageSize, take } = resolvePageSize(filter);
  return { page, pageSize, skip: (page - 1) * pageSize, take };
}
