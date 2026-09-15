import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT, toPublicGameDocument } from "./game-contract";
import type { PublicGameSummaryDto } from "./game-contract";
import { createGame, getGame, getPublicGame } from "./games";
import { sortPublicGames } from "./public-games";
import { rollGameMap } from "./random-map/map-roll";

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

async function withMemory(testBody: () => Promise<void>) {
  const databaseUrl = process.env.DATABASE_URL;
  const previousGames = globalThis.splatLabGamesMemory;
  delete process.env.DATABASE_URL;
  globalThis.splatLabGamesMemory = [];
  try {
    await testBody();
  } finally {
    globalThis.splatLabGamesMemory = previousGames;
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
  }
}

test("a saved generated map survives public play projection after reroll", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Public reroll", spec: DEFAULT_GAME_DOCUMENT });
    const rolled = await rollGameMap("owner-a", game.id, { length: "medium", reason: "reroll" });
    assert.equal(rolled.status, "rolled");
    if (rolled.status !== "rolled") return;

    const stored = await getGame("owner-a", game.id);
    assert.ok(stored);
    const publicSpec = toPublicGameDocument(stored.spec);
    assert.equal(publicSpec.generatedPlatformerMaps.length, 1);
    assert.match(publicSpec.generatedPlatformerMaps[0]?.source ?? "", /^custom-platformer-gen-/);
    assert.equal(publicSpec.mapStyle, "generated");
  });
});

test("stored and public reads reject a corrupted generated map", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", {
      title: "Corrupt generated map",
      isPublic: true,
      spec: DEFAULT_GAME_DOCUMENT,
    });
    const rolled = await rollGameMap("owner-a", game.id, { length: "medium", reason: "reroll" });
    assert.equal(rolled.status, "rolled");
    if (rolled.status !== "rolled") return;

    const record = globalThis.splatLabGamesMemory?.find((candidate) => candidate.id === game.id);
    assert.ok(record);
    record.spec.generatedPlatformerMaps[0]!.map.camera.columns = 999;

    await assert.rejects(() => getGame("owner-a", game.id));
    await assert.rejects(() => getPublicGame(game.id));
  });
});
