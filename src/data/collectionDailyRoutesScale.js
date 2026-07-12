export const COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE = 100;

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function collectionDailyRouteVisibleStopCount(total, requested = COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE) {
  const stopCount = nonNegativeInteger(total);
  if (!stopCount) return 0;
  const visibleCount = Math.max(
    COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE,
    nonNegativeInteger(requested)
  );
  return Math.min(stopCount, visibleCount);
}

export function collectionDailyRouteNextVisibleStopCount(total, current) {
  return collectionDailyRouteVisibleStopCount(
    total,
    nonNegativeInteger(current) + COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE
  );
}
