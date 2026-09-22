interface MarketplacePaginationPosition {
  page: number;
  totalPages: number;
}

export function shouldShowMarketplacePagination({
  page,
  totalPages,
}: MarketplacePaginationPosition): boolean {
  return totalPages > 1 && page >= 1 && page <= totalPages;
}
