export function buildGamePath(gameId: string) {
  return `/build/${encodeURIComponent(gameId)}`;
}

export function playGamePath(gameId: string) {
  return `/play/${encodeURIComponent(gameId)}`;
}

export function mediaSharePath(mediaId: string) {
  return `/media/${encodeURIComponent(mediaId)}`;
}

export function mediaEmbedPath(mediaId: string) {
  return `/media/${encodeURIComponent(mediaId)}/embed`;
}
