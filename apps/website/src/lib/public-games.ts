import type { PublicGameSummaryDto } from "./game-contract";

export const PUBLIC_GAME_SORTS = [
  "newest",
  "oldest",
  "alphabetical",
  "recently_updated",
] as const;

export type PublicGameSort = (typeof PUBLIC_GAME_SORTS)[number];

export function sortPublicGames(
  games: readonly PublicGameSummaryDto[],
  sort: PublicGameSort,
): PublicGameSummaryDto[] {
  return [...games].sort((left, right) => {
    if (sort === "alphabetical") {
      return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
    }
    if (sort === "oldest") {
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    }
    if (sort === "recently_updated") {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}
