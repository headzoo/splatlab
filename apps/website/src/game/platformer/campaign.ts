export const MAP_COMPLETION_DELAY_SECONDS = 3;

export function nextCampaignMapIndex(currentIndex: number, mapCount: number) {
  const nextIndex = currentIndex + 1;
  return nextIndex < mapCount ? nextIndex : null;
}
