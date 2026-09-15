import assert from "node:assert/strict";
import test from "node:test";

import { GAME_PLAYER_CONTENT } from "../game/game-player-content";
import { gameCampaignMaps } from "../game/game-levels";
import { applyCooperSpecChange } from "./cooper-spec-change";
import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "./game-contract";
import { GameObjectEditError } from "./game-objects";
import {
  MAX_LEVELS_PER_GAME,
  gameLevelSummaries,
  planAddLevel,
  planMoveLevel,
  planMoveLevelTo,
  planPlayerAppearance,
  planRemoveLevel,
  planRenameLevel,
  planSetActiveLevel,
} from "./game-levels-editing";

function apply(spec: GameDocument, plan: (current: GameDocument) => ReturnType<typeof planAddLevel>) {
  return applyCooperSpecChange(spec, plan(spec));
}

/** A game whose one level is still the shared catalog map, as a new game is. */
const NEW_GAME: GameDocument = DEFAULT_GAME_DOCUMENT;

function gameWithLevels(count: number): GameDocument {
  return Array.from({ length: count }).reduce<GameDocument>(
    (spec, _entry, index) => apply(spec, (current) =>
      planAddLevel(current, "Green Hills", `Level ${index + 1}`)),
    NEW_GAME,
  );
}

test("level numbers match the order the kid sees in the Level menu", () => {
  const spec = gameWithLevels(2);
  const campaign = gameCampaignMaps(spec, GAME_PLAYER_CONTENT.maps);

  assert.deepEqual(
    gameLevelSummaries(spec).map((level) => ({ number: level.number, name: level.name })),
    campaign.map((entry, index) => ({ number: index + 1, name: entry.label })),
  );
  assert.deepEqual(
    gameLevelSummaries(spec).map((level) => level.playing),
    [false, false, true],
    "only the level being shown is marked as playing",
  );
});

test("renaming a catalog level copies it into the game rather than changing the shared map", () => {
  const renamed = apply(NEW_GAME, (spec) => planRenameLevel(spec, 1, "My First Level"));

  assert.equal(renamed.platformerLevels.length, 1);
  assert.deepEqual(
    { source: renamed.platformerLevels[0].templateSource, label: renamed.platformerLevels[0].label },
    { source: "level-1.json", label: "My First Level" },
  );
  assert.equal(
    renamed.platformerMapSource,
    renamed.platformerLevels[0].id,
    "the copy is what plays now, so the catalog map is not listed twice",
  );
  assert.equal(gameLevelSummaries(renamed).length, 1);
});

test("a copied level takes its edits with it and leaves none behind", () => {
  const edited: GameDocument = {
    ...NEW_GAME,
    platformerObjectEdits: [
      { id: "cooper-coin-1", mapSource: "level-1.json", x: 3, y: 4, kind: "coin" },
    ],
    platformerTerrainEdits: [{ mapSource: "level-1.json", x: 1, y: 2, kind: "ground" }],
  };
  const renamed = apply(edited, (spec) => planRenameLevel(spec, 1, "Mine"));
  const moved = renamed.platformerLevels[0].id;

  assert.deepEqual(renamed.platformerObjectEdits.map((edit) => edit.mapSource), [moved]);
  assert.deepEqual(renamed.platformerTerrainEdits.map((edit) => edit.mapSource), [moved]);
});

test("deleting a level throws away everything that was put in it", () => {
  const twoLevels = gameWithLevels(2);
  const second = gameLevelSummaries(twoLevels)[1];
  const doomed = twoLevels.platformerLevels[1].id;
  assert.equal(second.number, 2);

  const edited: GameDocument = {
    ...twoLevels,
    platformerObjectEdits: [
      { id: "cooper-coin-1", mapSource: doomed, x: 3, y: 4, kind: "coin" },
    ],
    platformerObjectRemovals: [{ objectId: "coin_1", mapSource: doomed }],
    platformerObjectSettings: [
      {
        objectId: "enemy_1",
        mapSource: doomed,
        assetId: "neutral_robot_01",
        behavior: "patroller",
        direction: "left",
      },
    ],
    platformerTerrainEdits: [{ mapSource: doomed, x: 1, y: 2, kind: "ground" }],
  };

  const removed = apply(edited, (spec) => planRemoveLevel(spec, second.number));

  assert.equal(removed.platformerLevels.length, 2);
  assert.equal(
    removed.platformerLevels.some((level) => level.id === doomed),
    false,
  );
  assert.deepEqual(removed.platformerObjectEdits, []);
  assert.deepEqual(removed.platformerObjectRemovals, []);
  assert.deepEqual(removed.platformerObjectSettings, []);
  assert.deepEqual(removed.platformerTerrainEdits, []);
});

test("deleting the level being played moves on to the next one", () => {
  const spec = gameWithLevels(2);
  const removed = apply(spec, (current) => planRemoveLevel(current, 3));

  assert.equal(removed.platformerMapSource, removed.platformerLevels[1].id);
  assert.deepEqual(gameLevelSummaries(removed).map((level) => level.playing), [false, true]);
});

test("deleting a level that is not playing leaves the played one alone", () => {
  const spec = gameWithLevels(2);
  const playing = spec.platformerMapSource;
  const removed = apply(spec, (current) => planRemoveLevel(current, 1));

  assert.equal(removed.platformerMapSource, playing);
});

test("the last level cannot be deleted, because a game needs one to play", () => {
  assert.throws(
    () => planRemoveLevel(NEW_GAME, 1),
    (error: unknown) =>
      error instanceof GameObjectEditError && /needs at least one level/.test(error.reason),
  );
});

test("a level number outside the game is refused with the range that works", () => {
  assert.throws(
    () => planRenameLevel(gameWithLevels(2), 7, "Nope"),
    (error: unknown) =>
      error instanceof GameObjectEditError && error.reason === "This game has levels 1 to 3.",
  );
});

test("a game stops at its level cap instead of saving a document that cannot load", () => {
  const full = gameWithLevels(MAX_LEVELS_PER_GAME - 1);

  assert.equal(gameLevelSummaries(full).length, MAX_LEVELS_PER_GAME);
  assert.throws(
    () => planAddLevel(full, "Space", "One Too Many"),
    (error: unknown) =>
      error instanceof GameObjectEditError && /as many as it can hold/.test(error.reason),
  );
});

test("moving a level swaps it with its neighbour and renumbers the rest", () => {
  const spec = gameWithLevels(2);
  const names = gameLevelSummaries(spec).map((level) => level.name);
  const moved = apply(spec, (current) => planMoveLevel(current, 3, "earlier"));

  assert.deepEqual(
    gameLevelSummaries(moved).map((level) => level.name),
    [names[0], names[2], names[1]],
  );
});

test("dragging a level moves it directly to the dropped position", () => {
  const spec = gameWithLevels(3);
  const names = gameLevelSummaries(spec).map((level) => level.name);
  const moved = apply(spec, (current) => planMoveLevelTo(current, 4, 2));

  assert.deepEqual(
    gameLevelSummaries(moved).map((level) => level.name),
    [names[0], names[3], names[1], names[2]],
  );
  assert.equal(
    gameLevelSummaries(moved).find((level) => level.name === names[3])?.playing,
    true,
    "reordering keeps the same level selected",
  );
});

test("a level already at the end cannot move later", () => {
  assert.throws(
    () => planMoveLevel(gameWithLevels(1), 2, "later"),
    (error: unknown) =>
      error instanceof GameObjectEditError && /already last/.test(error.reason),
  );
});

test("showing the level already on screen leaves the game untouched", () => {
  const spec = gameWithLevels(1);
  const shown = apply(spec, (current) => planSetActiveLevel(current, 2));

  assert.deepEqual(shown, spec);
});

test("switching away from a catalog level keeps it in the list", () => {
  // A catalog map is only listed while it is the one being shown, so this is
  // the moment it would otherwise fall out of the game.
  const spec: GameDocument = {
    ...NEW_GAME,
    platformerLevels: [
      { id: "custom-platformer-space", templateSource: "level-2.json", label: "Space Run" },
    ],
  };
  assert.equal(spec.platformerMapSource, "level-1.json");
  assert.deepEqual(gameLevelSummaries(spec).map((level) => level.name), ["Green Hills", "Space Run"]);

  const shown = apply(spec, (current) => planSetActiveLevel(current, 2));

  assert.deepEqual(
    gameLevelSummaries(shown).map((level) => ({ name: level.name, playing: level.playing })),
    [{ name: "Green Hills 1", playing: false }, { name: "Space Run", playing: true }],
  );

  const back = apply(shown, (current) => planSetActiveLevel(current, 1));
  assert.deepEqual(gameLevelSummaries(back).map((level) => level.playing), [true, false]);
});

test("a maze game can only be built from worlds that have a maze", () => {
  const maze: GameDocument = { ...NEW_GAME, previewKind: "maze" };

  assert.throws(
    () => planAddLevel(maze, "Ice World", "Frozen"),
    (error: unknown) =>
      error instanceof GameObjectEditError && /worlds you can use are/.test(error.reason),
  );
  assert.equal(
    applyCooperSpecChange(maze, planAddLevel(maze, "Space", "Star Maze")).mazeLevels.length,
    2,
  );
});

test("an appearance the catalog does not have is refused", () => {
  assert.throws(
    () => planPlayerAppearance("skin_99", "hair_01"),
    (error: unknown) =>
      error instanceof GameObjectEditError && /skin tone/.test(error.reason),
  );
});

test("every level a kid can add resolves to a real checked-in map that can be played", () => {
  for (const template of GAME_PLAYER_CONTENT.maps) {
    const added = apply(NEW_GAME, (spec) => planAddLevel(spec, template.label, `A ${template.label}`));
    const campaign = gameCampaignMaps(added, GAME_PLAYER_CONTENT.maps);
    const playing = campaign.find((entry) => entry.source === added.platformerMapSource);

    assert.ok(playing, `${template.label} did not resolve to a playable level`);
    assert.equal(playing.label, `A ${template.label}`);
    assert.ok(
      playing.map.objects.some((object) => object.id.startsWith("spawn")),
      `${template.label} resolved to a map with nowhere for the player to start`,
    );
  }
});
