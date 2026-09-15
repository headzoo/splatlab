import assert from "node:assert/strict";
import test from "node:test";

import type { PublicGameSummaryDto } from "./game-contract";
import { sortPublicGames } from "./public-games";

function game(
  title: string,
  createdAt: string,
  updatedAt = createdAt,
): PublicGameSummaryDto {
  return {
    id: title,
    title,
    isPublic: true,
    gameType: "platformer",
    mapSource: "level-1.json",
    thumbnailDataUrl: null,
    revision: 1,
    createdAt,
    updatedAt,
    creator: {
      displayName: "Captain Waffle",
      avatarSrc: "/brand/lab-names/01.png",
    },
  };
}

const GAMES = [
  game("Zany Run", "2026-01-02T00:00:00.000Z"),
  game("apple maze", "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"),
  game("Bouncy Castle", "2026-01-03T00:00:00.000Z"),
];

test("public game sort options order copies without mutating the source", () => {
  assert.deepEqual(
    sortPublicGames(GAMES, "newest").map((entry) => entry.title),
    ["Bouncy Castle", "Zany Run", "apple maze"],
  );
  assert.deepEqual(
    sortPublicGames(GAMES, "oldest").map((entry) => entry.title),
    ["apple maze", "Zany Run", "Bouncy Castle"],
  );
  assert.deepEqual(
    sortPublicGames(GAMES, "alphabetical").map((entry) => entry.title),
    ["apple maze", "Bouncy Castle", "Zany Run"],
  );
  assert.equal(sortPublicGames(GAMES, "recently_updated")[0]?.title, "apple maze");
  assert.deepEqual(GAMES.map((entry) => entry.title), ["Zany Run", "apple maze", "Bouncy Castle"]);
});
