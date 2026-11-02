interface InitialCatsLoadState {
  catCount: number;
  fromCache: boolean;
}

interface OwnerCatDataLoadingState {
  hasOwner: boolean;
  ownerReady: boolean;
  hasFallbackCatalog: boolean;
  isLoading: boolean;
}

interface OwnerCatCatalogReadyState {
  hasOwner: boolean;
  hasFallbackCatalog: boolean;
  catCount: number;
  fallbackCatalogComplete: boolean;
  primaryCatalogReady: boolean;
}

export function shouldFinishInitialCatsLoad({
  catCount,
  fromCache,
}: InitialCatsLoadState) {
  return catCount > 0 || !fromCache;
}

export function isOwnerCatDataLoading({
  hasOwner,
  ownerReady,
  hasFallbackCatalog,
  isLoading,
}: OwnerCatDataLoadingState) {
  if (hasFallbackCatalog) return false;
  if (!hasOwner) return isLoading;
  return !ownerReady || isLoading;
}

export function isOwnerCatCatalogReady({
  hasOwner,
  hasFallbackCatalog,
  fallbackCatalogComplete,
  catCount,
  primaryCatalogReady,
}: OwnerCatCatalogReadyState) {
  if (!hasOwner) return false;
  if (hasFallbackCatalog) return catCount > 0 || fallbackCatalogComplete;
  return primaryCatalogReady;
}
