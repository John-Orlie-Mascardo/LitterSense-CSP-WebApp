interface InitialCatsLoadState {
  catCount: number;
  fromCache: boolean;
}

export function shouldFinishInitialCatsLoad({
  catCount,
  fromCache,
}: InitialCatsLoadState) {
  return catCount > 0 || !fromCache;
}
