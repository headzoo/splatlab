export function buildGamePath(gameId: string) {
  return `/build/${encodeURIComponent(gameId)}`;
}

export function playGamePath(gameId: string) {
  return `/play/${encodeURIComponent(gameId)}`;
}
