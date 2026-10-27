export function pagesOf<T>(items: readonly T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  return pages;
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  totalPages: number;
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  perPage: number,
): PageSlice<T> {
  const pages = pagesOf(items, perPage);
  const totalPages = Math.max(1, pages.length);
  const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
  return { items: pages[safePage] ?? [], page: safePage, totalPages };
}
