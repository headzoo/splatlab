import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "../game-contract";
import { createGame, getGame, updateGame } from "../games";
import { gameCampaignMaps, gameMazeMaps } from "@/game/game-levels";
import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";

import { rollGameMap } from "./map-roll";

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

test("a platformer roll stores a fresh authoritative generated map", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Roll me", spec: DEFAULT_GAME_DOCUMENT });
    const outcome = await rollGameMap("owner-a", game.id, {
      length: "short",
      reason: "setup",
      expectedRevision: game.revision,
    });
    assert.equal(outcome.status, "rolled");
    if (outcome.status !== "rolled") return;

    const source = outcome.result.change.platformerMapSource;
    assert.match(source ?? "", /^custom-platformer-gen-/);
    assert.equal(outcome.result.revision, game.revision + 1);
    const stored = await getGame("owner-a", game.id);
    assert.equal(stored?.mapSource, source);
    assert.equal(stored?.spec.mapStyle, "generated");
    assert.equal(stored?.spec.mapLength, "short");
    assert.equal(stored?.spec.generatedPlatformerMaps[0]?.source, source);
  });
});

test("persisted random setup donors roll for new and existing platformer and maze games", async () => {
  await withMemory(async () => {
    for (const previewKind of ["platformer", "maze"] as const) {
      const awaitingLength: GameDocument = {
        ...DEFAULT_GAME_DOCUMENT,
        previewKind,
        mapStyle: "generated" as const,
        setupStep: "mapLength" as const,
        builderSetupHistory: ["gameType", "theme", "mapStyle", "mapLength"],
      };

      const newGame = await createGame("owner-a", {
        title: `New ${previewKind} random game`,
        spec: awaitingLength,
      });
      const newRoll = await rollGameMap("owner-a", newGame.id, {
        length: "short",
        reason: "setup",
        expectedRevision: newGame.revision,
      });
      assert.equal(newRoll.status, "rolled");
      if (newRoll.status !== "rolled") return;

      const existing = await createGame("owner-a", {
        title: `Existing ${previewKind} random game`,
        spec: { ...DEFAULT_GAME_DOCUMENT, previewKind },
      });
      const savedSelection = await updateGame("owner-a", existing.id, {
        title: existing.title,
        spec: awaitingLength,
        expectedRevision: existing.revision,
      });
      assert.equal(savedSelection.status, "updated");
      if (savedSelection.status !== "updated") return;
      const existingRoll = await rollGameMap("owner-a", existing.id, {
        length: "long",
        reason: "setup",
        expectedRevision: savedSelection.game.revision,
      });
      assert.equal(existingRoll.status, "rolled");
      if (existingRoll.status !== "rolled") return;

      const stored = await getGame("owner-a", existing.id);
      assert.equal(stored?.spec.mapStyle, "generated");
      assert.equal(stored?.spec.setupStep, "mapLength");
      assert.equal(stored?.spec.mapLength, "long");
      if (previewKind === "platformer") {
        assert.match(stored?.spec.platformerMapSource ?? "", /^custom-platformer-gen-/);
        assert.equal(stored?.spec.generatedPlatformerMaps.length, 1);
      } else {
        assert.match(stored?.spec.mazeMapSource ?? "", /^custom-maze-gen-/);
        assert.equal(stored?.spec.generatedMazeMaps.length, 1);
      }
    }
  });
});

test("roll confirmation prevents edit loss and confirmed rerolls prune old edits", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Roll me", spec: DEFAULT_GAME_DOCUMENT });
    const first = await rollGameMap("owner-a", game.id, { length: "short", reason: "setup" });
    assert.equal(first.status, "rolled");
    if (first.status !== "rolled") return;
    const source = first.result.change.platformerMapSource!;
    const current = await getGame("owner-a", game.id);
    assert.ok(current);
    const edited = await updateGame("owner-a", game.id, {
      title: current.title,
      spec: {
        ...current.spec,
        platformerTerrainEdits: [{ mapSource: source, x: 1, y: 1, kind: "ground" }],
      },
      expectedRevision: current.revision,
    });
    assert.equal(edited.status, "updated");
    if (edited.status !== "updated") return;

    const refused = await rollGameMap("owner-a", game.id, { length: "medium", reason: "reroll" });
    assert.equal(refused.status, "confirmation_required");
    assert.equal((await getGame("owner-a", game.id))?.revision, edited.game.revision);

    const rerolled = await rollGameMap("owner-a", game.id, {
      length: "medium",
      reason: "reroll",
      confirmDiscardEdits: true,
    });
    assert.equal(rerolled.status, "rolled");
    if (rerolled.status !== "rolled") return;
    assert.notEqual(rerolled.result.change.platformerMapSource, source);
    const stored = await getGame("owner-a", game.id);
    assert.deepEqual(stored?.spec.platformerTerrainEdits, []);
    assert.equal(stored?.spec.generatedPlatformerMaps.some((record) => record.source === source), false);
  });
});

test("a stale autosave cannot restore any edit array after a roll", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "No stale edits", spec: DEFAULT_GAME_DOCUMENT });
    const first = await rollGameMap("owner-a", game.id, { length: "short", reason: "setup" });
    assert.equal(first.status, "rolled");
    if (first.status !== "rolled") return;
    const retired = first.result.change.platformerMapSource!;
    const beforeReroll = await getGame("owner-a", game.id);
    assert.ok(beforeReroll);
    const edited = await updateGame("owner-a", game.id, {
      title: beforeReroll.title,
      expectedRevision: beforeReroll.revision,
      spec: {
        ...beforeReroll.spec,
        platformerTerrainEdits: [{ mapSource: retired, x: 1, y: 1, kind: "ground" }],
        platformerObjectEdits: [{ id: "old-coin", mapSource: retired, x: 1, y: 1, kind: "coin" }],
        platformerObjectRemovals: [{ mapSource: retired, objectId: "old-object" }],
        platformerObjectSettings: [{
          mapSource: retired,
          objectId: "old-coin",
          assetId: "neutral_ghost_01",
          behavior: "patroller",
          direction: "left",
        }],
        platformerLevelArt: [{
          mapSource: retired,
          slot: "platform",
          world: "space_orbital_outpost_01",
        }],
      },
    });
    assert.equal(edited.status, "updated");
    if (edited.status !== "updated") return;

    const rerolled = await rollGameMap("owner-a", game.id, {
      length: "medium",
      reason: "reroll",
      confirmDiscardEdits: true,
    });
    assert.equal(rerolled.status, "rolled");
    if (rerolled.status !== "rolled") return;

    const staleSave = await updateGame("owner-a", game.id, {
      title: edited.game.title,
      expectedRevision: rerolled.result.revision,
      spec: edited.game.spec,
    });
    assert.equal(staleSave.status, "updated");
    if (staleSave.status !== "updated") return;
    assert.equal(staleSave.game.spec.platformerMapSource, rerolled.result.change.platformerMapSource);
    for (const entries of [
      staleSave.game.spec.platformerTerrainEdits,
      staleSave.game.spec.platformerObjectEdits,
      staleSave.game.spec.platformerObjectRemovals,
      staleSave.game.spec.platformerObjectSettings,
      staleSave.game.spec.platformerLevelArt,
    ]) {
      assert.deepEqual(entries, []);
    }
  });
});

test("rolls enforce owner scope and explicit revision conflicts", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Roll me", spec: DEFAULT_GAME_DOCUMENT });
    assert.deepEqual(
      await rollGameMap("owner-b", game.id, { length: "short", reason: "setup" }),
      { status: "not_found" },
    );
    const conflict = await rollGameMap("owner-a", game.id, {
      length: "short",
      reason: "setup",
      expectedRevision: game.revision + 1,
    });
    assert.deepEqual(conflict, { status: "conflict", gameRevision: game.revision });
  });
});

test("maze rolls use the active maze donor and materialize it", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", {
      title: "Maze roll",
      spec: { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" },
    });
    const outcome = await rollGameMap("owner-a", game.id, { length: "medium", reason: "setup" });
    assert.equal(outcome.status, "rolled");
    if (outcome.status !== "rolled") return;
    assert.match(outcome.result.change.mazeMapSource ?? "", /^custom-maze-gen-/);
    const stored = await getGame("owner-a", game.id);
    assert.equal(stored?.spec.generatedMazeMaps.length, 1);
    assert.equal(stored?.spec.generatedMazeMaps[0]?.length, "medium");
    assert.equal(stored?.spec.generatedMazeMaps[0]?.templateSource, "maze_green_hills_01.json");
  });
});

test("a platformer roll replaces only the active campaign level in place", async () => {
  await withMemory(async () => {
    const active = "custom-platformer-campaign-active";
    const game = await createGame("owner-a", {
      title: "Campaign roll",
      spec: {
        ...DEFAULT_GAME_DOCUMENT,
        platformerMapSource: active,
        platformerLevels: [
          { id: "custom-platformer-campaign-first", templateSource: "level-1.json", label: "First" },
          { id: active, templateSource: "level-2.json", label: "Middle" },
          { id: "custom-platformer-campaign-last", templateSource: "level-3.json", label: "Last" },
        ],
      },
    });
    const outcome = await rollGameMap("owner-a", game.id, { length: "long", reason: "reroll" });
    assert.equal(outcome.status, "rolled");
    if (outcome.status !== "rolled") return;

    const stored = await getGame("owner-a", game.id);
    assert.deepEqual(
      stored?.spec.platformerLevels.map(({ id, label }) => ({ id, label })),
      [
        { id: "custom-platformer-campaign-first", label: "First" },
        { id: outcome.result.change.platformerMapSource, label: "Middle" },
        { id: "custom-platformer-campaign-last", label: "Last" },
      ],
    );
    assert.deepEqual(
      gameCampaignMaps(stored!.spec, GAME_PLAYER_CONTENT.maps).map(({ source, label }) => ({ source, label })),
      stored?.spec.platformerLevels.map(({ id, label }) => ({ source: id, label })),
    );
  });
});

test("a maze roll replaces only the active campaign level in place", async () => {
  await withMemory(async () => {
    const active = "custom-maze-campaign-active";
    const game = await createGame("owner-a", {
      title: "Maze campaign roll",
      spec: {
        ...DEFAULT_GAME_DOCUMENT,
        previewKind: "maze",
        mazeMapSource: active,
        mazeLevels: [
          { id: "custom-maze-campaign-first", templateSource: "maze_green_hills_01.json", label: "First maze" },
          { id: active, templateSource: "maze_space_01.json", label: "Middle maze" },
          { id: "custom-maze-campaign-last", templateSource: "maze_graveyard_01.json", label: "Last maze" },
        ],
      },
    });
    const outcome = await rollGameMap("owner-a", game.id, { length: "short", reason: "reroll" });
    assert.equal(outcome.status, "rolled");
    if (outcome.status !== "rolled") return;

    const stored = await getGame("owner-a", game.id);
    assert.deepEqual(
      stored?.spec.mazeLevels.map(({ id, label }) => ({ id, label })),
      [
        { id: "custom-maze-campaign-first", label: "First maze" },
        { id: outcome.result.change.mazeMapSource, label: "Middle maze" },
        { id: "custom-maze-campaign-last", label: "Last maze" },
      ],
    );
    assert.deepEqual(
      gameMazeMaps(stored!.spec, GAME_PLAYER_CONTENT.mazes).map(({ source, label }) => ({ source, label })),
      stored?.spec.mazeLevels.map(({ id, label }) => ({ source: id, label })),
    );
  });
});

test("returning to ready-made removes generated map records across repeated toggles", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Toggle maps", spec: DEFAULT_GAME_DOCUMENT });
    for (let index = 0; index < 21; index += 1) {
      const current = await getGame("owner-a", game.id);
      assert.ok(current);
      const rolled = await rollGameMap("owner-a", game.id, {
        length: "short",
        reason: "setup",
        expectedRevision: current.revision,
      });
      assert.equal(rolled.status, "rolled");
      const generated = await getGame("owner-a", game.id);
      assert.ok(generated);
      const readyMade = await updateGame("owner-a", game.id, {
        title: generated.title,
        expectedRevision: generated.revision,
        spec: {
          ...generated.spec,
          mapStyle: "ready_made",
          platformerMapSource: "level-1.json",
          generatedPlatformerMaps: [],
          generatedMazeMaps: [],
        },
      });
      assert.equal(readyMade.status, "updated");
      if (readyMade.status !== "updated") return;
      assert.equal(readyMade.game.spec.generatedPlatformerMaps.length, 0);
      assert.equal(readyMade.game.spec.platformerLevels.some(
        (level) => level.id.startsWith("custom-platformer-gen-"),
      ), false);
    }
  });
});
