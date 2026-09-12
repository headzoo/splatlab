export function buildGamePath(gameId: string) {
  return `/build/${encodeURIComponent(gameId)}`;
}
