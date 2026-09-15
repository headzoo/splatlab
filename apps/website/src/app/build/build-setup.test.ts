import assert from "node:assert/strict";
import test from "node:test";

import { GAME_PLAYER_CONTENT } from "@/game/game-player-content";
import { gameCampaignMaps } from "@/game/game-levels";
import { applyPlatformerObjectEdits } from "@/game/platformer/map-editing";
import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "@/lib/game-contract";
import { COOPER_OBJECT_KINDS } from "@/lib/game-objects";
import { PLATFORMER_EDITABLE_PATHS } from "@/lib/game-physics";

import { applyCooperSpecChange, mapRollChangeSchema, specChangeFrom } from "@/lib/cooper-spec-change";
import { activeMapSource } from "@/lib/game-contract";
import { createGame, getGame, updateGame } from "@/lib/games";
import { createGameHistory, gameHistoryReducer } from "@/lib/game-history";
import { rollGameMap } from "@/lib/random-map/map-roll";

import {
  activeMapRollLength,
  interpretMapRollResponse,
  mergeBuilderSetupChange,
  needsMapRollDiscardConfirmation,
  rolledSpecFromOutcome,
  serializeMapRollStart,
} from "./build-map-roll";
import {
  buildGameNameOptions,
  parseBuildTurnResult,
  persistedBuildTurn,
  reconcilePersistedGame,
  isSetupHistoryLocked,
  setupQuestionHistoryFromSpec,
  setupSelectionsFromSpec,
} from "./build-setup";
import { buildPromptSuggestions } from "./build-prompt-suggestions";
import {
  cooperSetupChoiceReplies,
  setupChoiceReplyFor,
} from "./build-setup-replies";

test("post-setup prompt suggestions only ask for things Cooper's tools can do", () => {
  const suggestions = buildPromptSuggestions("platformer");
  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.label),
    [
      "Add another level",
      "Add more coins",
      "Add more enemies",
      "Add a boss",
      "Add some springs",
      "Add a checkpoint",
      "Give me 10 lives",
      "Make me jump higher",
      "Make me run faster",
      "Let me fly",
    ],
  );
});

test("Cooper-bound prompt chips send a polite, punctuated chat message", () => {
  const suggestions = buildPromptSuggestions("platformer");
  const addLevel = suggestions[0];
  assert.equal(addLevel?.label, "Add another level");
  assert.equal(addLevel?.message, undefined);

  const chatPrompts = suggestions.slice(1);
  assert.equal(chatPrompts.length > 0, true);
  for (const suggestion of chatPrompts) {
    assert.match(
      suggestion.message ?? "",
      /^Please .+\.$/,
      `${suggestion.label} should send a polite sentence`,
    );
  }
});

test("every object suggestion names a kind Cooper is allowed to add", () => {
  const addable = new Set<string>(COOPER_OBJECT_KINDS);

  assert.equal(addable.has("coin"), true);
  assert.equal(addable.has("enemy"), true);
  assert.equal(addable.has("boss"), true);
  assert.equal(addable.has("platform_spring"), true);
  assert.equal(addable.has("checkpoint"), true);
  assert.equal(addable.has("spawn"), false, "the player start is never addable");
  assert.equal(addable.has("goal"), false, "the goal is never addable");
});

test("every platformer suggestion has an editable physics path behind it", () => {
  const editable = new Set(PLATFORMER_EDITABLE_PATHS);

  for (const path of [
    "/verticalMovement/groundedJump/jumpHeightTiles",
    "/movement/maximumRunSpeedTilesPerSecond",
    "/verticalMovement/groundedJump/maximumFallSpeedTilesPerSecond",
    "/verticalMovement/mode",
  ]) {
    assert.equal(editable.has(path), true, `${path} is no longer editable`);
  }
});

test("a maze is only offered the level picker, since it ignores the physics document", () => {
  assert.deepEqual(buildPromptSuggestions("maze"), [
    { label: "Add another level" },
  ]);
});

test("a new unsaved game has no locked setup answers", () => {
  assert.deepEqual(setupSelectionsFromSpec(null), {
    gameType: null,
    theme: null,
      mapStyle: null,
      mapLength: null,
    character: null,
    humanGender: null,
    skinTone: null,
    hairColor: null,
    gameName: null,
  });
});

test("setup choices lock only after game creation is complete", () => {
  assert.equal(isSetupHistoryLocked("gameType"), false);
  assert.equal(isSetupHistoryLocked("theme"), false);
  assert.equal(isSetupHistoryLocked("character"), false);
  assert.equal(isSetupHistoryLocked("complete"), true);
});

test("a partially completed game restores only its locked answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      previewKind: "maze",
      platformerMapSource: "level-2.json",
      mazeMapSource: "maze_space_01.json",
      setupStep: "character",
    }),
    {
      gameType: "maze",
      theme: "space",
      mapStyle: "ready_made",
      mapLength: null,
      character: null,
      humanGender: null,
      skinTone: null,
      hairColor: null,
      gameName: null,
    },
  );
});

test("a completed human setup restores gender and appearance answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec(
      {
        ...DEFAULT_GAME_DOCUMENT,
        platformerMapSource: "level-3.json",
        playerCharacter: "human",
        humanGender: "girl",
        skinTone: "skin_01",
        hairColor: "hair_06",
        setupStep: "complete",
      },
      "Crypt Dash",
    ),
    {
      gameType: "platformer",
      theme: "graveyard",
      mapStyle: "ready_made",
      mapLength: null,
      character: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
      gameName: "Crypt Dash",
    },
  );
});

test("a completed nonhuman setup does not expose unused human answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      playerCharacter: "robot",
      setupStep: "complete",
    }),
    {
      gameType: "platformer",
      theme: "green_hills",
      mapStyle: "ready_made",
      mapLength: null,
      character: "robot",
      humanGender: null,
      skinTone: null,
      hairColor: null,
      gameName: "Green Hills Platformer",
    },
  );
});

test("a generated setup awaiting length restores the map-length question", () => {
  const spec: GameDocument = {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated" as const,
    mapLength: "long" as const,
    setupStep: "mapLength" as const,
    builderSetupHistory: ["gameType", "theme", "mapStyle", "mapLength"],
  };
  assert.deepEqual(setupSelectionsFromSpec(spec), {
    gameType: "platformer",
    theme: "green_hills",
    mapStyle: "generated",
    mapLength: null,
    character: null,
    humanGender: null,
    skinTone: null,
    hairColor: null,
    gameName: null,
  });
  assert.deepEqual(
    setupQuestionHistoryFromSpec({ ...spec, builderSetupHistory: [] }),
    ["gameType", "theme", "mapStyle", "mapLength"],
  );
});

test("ready-made setups skip the map length question", () => {
  assert.deepEqual(
    setupQuestionHistoryFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      builderSetupHistory: [],
      playerCharacter: "human",
      setupStep: "hairColor",
    }),
    ["gameType", "theme", "mapStyle", "character", "humanGender", "skinTone", "hairColor"],
  );
});

test("a completed legacy setup transcript includes the name question", () => {
  assert.deepEqual(
    setupQuestionHistoryFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      builderSetupHistory: [],
      setupStep: "complete",
    }),
    ["gameType", "theme", "mapStyle", "character", "gameName"],
  );
});

test("game name choices are generated from the setup selections", () => {
  assert.deepEqual(
    buildGameNameOptions({
      gameType: "maze",
      theme: "space",
      character: "robot",
      humanGender: null,
    }),
    [
      "Robot's Star Mission",
      "Space Maze",
      "Rocket Robot Escape",
      "Moon Key Quest",
    ],
  );
  assert.equal(
    buildGameNameOptions({
      gameType: "platformer",
      theme: "green_hills",
      character: "rupert",
      humanGender: null,
    })[0],
    "Rupert's Hill Hop",
  );
  assert.equal(
    buildGameNameOptions({
      gameType: "platformer",
      theme: "green_hills",
      character: "jamie",
      humanGender: null,
    })[0],
    "Jamie's Hill Hop",
  );
  assert.equal(
    buildGameNameOptions({
      gameType: "maze",
      theme: "graveyard",
      character: "vix",
      humanGender: null,
    })[0],
    "Vix's Ghost Quest",
  );
  assert.equal(
    buildGameNameOptions({
      gameType: "platformer",
      theme: "green_hills",
      character: "leenie",
      humanGender: null,
    })[0],
    "Leenie's Hill Hop",
  );
  assert.equal(
    buildGameNameOptions({
      gameType: "platformer",
      theme: "green_hills",
      character: "lango",
      humanGender: null,
    })[0],
    "Lango's Hill Hop",
  );
});

test("setup choice replies cover game type, theme, style, and length", () => {
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies).sort(), [
    "gameType",
    "mapLength",
    "mapStyle",
    "theme",
  ]);
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies.gameType).sort(), [
    "maze",
    "platformer",
  ]);
  assert.deepEqual(Object.keys(cooperSetupChoiceReplies.theme).sort(), [
    "dragon_world",
    "graveyard",
    "green_hills",
    "space",
  ]);
  assert.equal(
    setupChoiceReplyFor("theme", "space"),
    "Be careful, there's less gravity in space.",
  );
  assert.equal(
    setupChoiceReplyFor("mapLength", "short"),
    "Your short map is ready for a quick adventure.",
  );
});

test("a build-turn result appends the server-persisted exchange and trims history", () => {
  const history = Array.from({ length: 49 }, (_, index) => ({
    role: "user" as const,
    message: `Earlier message ${index}`,
  }));
  const turn = persistedBuildTurn(history, "Add a moon", {
    status: "paused",
    cooperMessage: "Should I add craters too?",
    runId: "run-1",
    revision: 12,
  });

  assert.equal(turn.chatHistory.length, 50);
  assert.deepEqual(turn.chatHistory.slice(-2), [
    { role: "user", message: "Add a moon" },
    { role: "cooper", message: "Should I add craters too?" },
  ]);
});

test("a resume without feedback only adds Cooper's persisted reply", () => {
  const turn = persistedBuildTurn(
    [{ role: "cooper", message: "Continue?" }],
    "",
    {
      status: "replied",
      cooperMessage: "Great, I continued.",
      runId: "run-1",
      revision: 13,
    },
  );

  assert.deepEqual(turn.chatHistory, [
    { role: "cooper", message: "Continue?" },
    { role: "cooper", message: "Great, I continued." },
  ]);
});

test("an optimistic user bubble is not recorded twice when Cooper replies", () => {
  const turn = persistedBuildTurn(
    [
      { role: "cooper", message: "What should we change?" },
      { role: "user", message: "Make me jump higher" },
    ],
    "Make me jump higher",
    {
      status: "replied",
      cooperMessage: "You can jump higher now.",
      runId: "run-2",
      revision: 14,
    },
  );

  assert.deepEqual(turn.chatHistory, [
    { role: "cooper", message: "What should we change?" },
    { role: "user", message: "Make me jump higher" },
    { role: "cooper", message: "You can jump higher now." },
  ]);
});

test("server transcript reconciliation retains unsaved map and setup edits", () => {
  const saved = DEFAULT_GAME_DOCUMENT;
  const server = {
    ...DEFAULT_GAME_DOCUMENT,
    builderChatHistory: [{ role: "user" as const, message: "Server message" }],
  };
  const local = {
    ...DEFAULT_GAME_DOCUMENT,
    playerCharacter: "robot" as const,
    platformerTerrainEdits: [{ mapSource: "level-1.json" as const, x: 3, y: 4, kind: "ground" as const }],
  };

  assert.deepEqual(reconcilePersistedGame(server, saved, local), {
    ...server,
    playerCharacter: "robot",
    platformerTerrainEdits: [{ mapSource: "level-1.json", x: 3, y: 4, kind: "ground" }],
  });
});

test("Cooper's objects and the kid's unsaved objects both survive reconciliation", () => {
  const cooperCoin = {
    id: "cooper-coin-1",
    mapSource: "level-1.json" as const,
    x: 0,
    y: 0,
    kind: "coin" as const,
  };
  const kidSpring = {
    id: "build-platform_spring-abc",
    mapSource: "level-1.json" as const,
    x: 2,
    y: 10,
    kind: "platform_spring" as const,
  };

  const saved = DEFAULT_GAME_DOCUMENT;
  const server = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [cooperCoin] };
  const local = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [kidSpring] };

  assert.deepEqual(
    reconcilePersistedGame(server, saved, local).platformerObjectEdits,
    [cooperCoin, kidSpring],
  );
});

test("an object the kid erased is not resurrected by the server's copy", () => {
  const cooperCoin = {
    id: "cooper-coin-1",
    mapSource: "level-1.json" as const,
    x: 0,
    y: 0,
    kind: "coin" as const,
  };
  const erased = { mapSource: "level-1.json" as const, objectId: "cooper-coin-1" };

  const saved = { ...DEFAULT_GAME_DOCUMENT, platformerObjectEdits: [cooperCoin] };
  const server = saved;
  // Erasing drops the edit and records a removal, which suppresses the union.
  const local = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerObjectEdits: [],
    platformerObjectRemovals: [erased],
  };

  const reconciled = reconcilePersistedGame(server, saved, local);
  assert.deepEqual(reconciled.platformerObjectEdits, [cooperCoin]);
  assert.deepEqual(reconciled.platformerObjectRemovals, [erased]);
  assert.deepEqual(
    applyPlatformerObjectEdits(
      GAME_PLAYER_CONTENT.maps[0].map,
      "level-1.json",
      reconciled.platformerObjectEdits,
      reconciled.platformerObjectRemovals,
    ).objects.filter((object) => object.id === "cooper-coin-1"),
    [],
  );
});

test("re-roll length comes from the active generated record or stored default", () => {
  const generatedSource = "custom-platformer-gen-test-length";
  const spec = {
    ...DEFAULT_GAME_DOCUMENT,
    mapLength: "medium" as const,
    platformerMapSource: generatedSource,
    generatedPlatformerMaps: [{
      source: generatedSource,
      templateSource: "level-1.json" as const,
      length: "long" as const,
      generatorVersion: "test-v1",
      map: GAME_PLAYER_CONTENT.maps[0].map,
    }],
  };
  assert.equal(activeMapRollLength(spec), "long");

  const readyMade = {
    ...DEFAULT_GAME_DOCUMENT,
    mapLength: "short" as const,
    platformerMapSource: "level-1.json" as const,
  };
  assert.equal(activeMapRollLength(readyMade), "short");
});

test("re-roll confirmation is required only when the active source has edits", () => {
  const clean = DEFAULT_GAME_DOCUMENT;
  const edited = {
    ...DEFAULT_GAME_DOCUMENT,
    platformerTerrainEdits: [{
      mapSource: "level-1.json" as const,
      x: 1,
      y: 1,
      kind: "ground" as const,
    }],
  };
  assert.equal(needsMapRollDiscardConfirmation(clean), false);
  assert.equal(needsMapRollDiscardConfirmation(edited), true);
});

const TEST_ROLLED_PLATFORMER_MAP = {
  schemaVersion: 1,
  id: "rolled",
  revision: 1,
  runtime: "platformer_v1",
  tileSize: 64,
  size: { columns: 2, rows: 2 },
  camera: { columns: 2, rows: 2 },
  physics: { gravityScale: 1 },
  rules: { respawnDelaySeconds: 1 },
  presentation: { backgroundId: "neutral_green_hills_01" },
  legend: { ".": { visualSlot: "empty", collision: "none" } },
  layers: [{ id: "terrain", rows: ["..", ".."] }],
  objects: [
    {
      id: "spawn",
      type: "player_spawn",
      x: 0,
      y: 0,
      speedPxPerSecond: 320,
      motion: { version: 1, travel: { type: "controlled" }, visual: { type: "none" } },
    },
    { id: "goal", type: "goal", x: 1, y: 0 },
  ],
};

test("specChangeFrom is not a preview adopt because it drops generated maps", () => {
  const source = "custom-platformer-gen-preview-trap";
  const rolledMap = {
    ...TEST_ROLLED_PLATFORMER_MAP,
    id: source,
    layers: [{ id: "terrain", rows: ["^^", "##"] }],
  };
  const rolled: GameDocument = {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated",
    platformerMapSource: source,
    platformerLevels: [{ id: source, templateSource: "level-1.json", label: "Random map" }],
    generatedPlatformerMaps: [{
      source,
      templateSource: "level-1.json",
      length: "medium",
      generatorVersion: "test-v1",
      map: rolledMap,
    }],
  };

  const trapped = applyCooperSpecChange(DEFAULT_GAME_DOCUMENT, specChangeFrom(rolled));
  assert.equal(trapped.platformerMapSource, source);
  assert.equal(trapped.generatedPlatformerMaps.length, 0);
  const fallback = gameCampaignMaps(trapped, GAME_PLAYER_CONTENT.maps);
  assert.equal(fallback[0]?.source, source);
  assert.notEqual(fallback[0]?.map.layers[0]?.rows.join(""), "^^##");
});

test("adopting a roll via setup keeps the generated map body without a refetch", () => {
  const source = "custom-platformer-gen-preview-adopt";
  const rolledMap = {
    ...TEST_ROLLED_PLATFORMER_MAP,
    id: source,
    layers: [{ id: "terrain", rows: ["^^", "##"] }],
  };
  const rolled: GameDocument = {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated",
    platformerMapSource: source,
    platformerLevels: [{ id: source, templateSource: "level-1.json", label: "Random map" }],
    generatedPlatformerMaps: [{
      source,
      templateSource: "level-1.json",
      length: "medium",
      generatorVersion: "test-v1",
      map: rolledMap,
    }],
  };

  const adopted = gameHistoryReducer(createGameHistory(DEFAULT_GAME_DOCUMENT), {
    type: "setup",
    spec: rolled,
  });
  const campaign = gameCampaignMaps(adopted.present, GAME_PLAYER_CONTENT.maps);
  assert.equal(campaign[0]?.source, source);
  assert.equal(campaign[0]?.map.layers[0]?.rows.join(""), "^^##");
});

test("a follow-up setup edit after a roll cannot drop generated maps", () => {
  const source = "custom-platformer-gen-preview-keep";
  const rolled: GameDocument = {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated",
    platformerMapSource: source,
    platformerLevels: [{ id: source, templateSource: "level-1.json", label: "Random map" }],
    generatedPlatformerMaps: [{
      source,
      templateSource: "level-1.json",
      length: "medium",
      generatorVersion: "test-v1",
      map: { ...TEST_ROLLED_PLATFORMER_MAP, id: source },
    }],
  };

  const kept = mergeBuilderSetupChange(rolled, {
    playerCharacter: "chicken",
    setupStep: "character",
    platformerMapSource: "level-1.json",
    generatedPlatformerMaps: [],
  });
  assert.equal(kept.platformerMapSource, source);
  assert.equal(kept.generatedPlatformerMaps[0]?.source, source);
  assert.equal(kept.playerCharacter, "chicken");

  const reset = mergeBuilderSetupChange(rolled, {
    mapStyle: "ready_made",
    platformerMapSource: "level-1.json",
    generatedPlatformerMaps: [],
  });
  assert.equal(reset.mapStyle, "ready_made");
  assert.equal(reset.platformerMapSource, "level-1.json");
  assert.equal(reset.generatedPlatformerMaps.length, 0);
});

test("map-roll HTTP responses distinguish success, confirmation, conflict, and errors", () => {
  const change = mapRollChangeSchema.parse({
    previewKind: "platformer",
    platformerMapSource: "custom-platformer-gen-http",
    generatedPlatformerMaps: [{
      source: "custom-platformer-gen-http",
      templateSource: "level-1.json",
      length: "medium",
      generatorVersion: "test-v1",
      map: { ...TEST_ROLLED_PLATFORMER_MAP, id: "custom-platformer-gen-http" },
    }],
  });
  assert.deepEqual(
    interpretMapRollResponse(200, { revision: 4, change }),
    { status: "success", result: { revision: 4, change } },
  );
  assert.deepEqual(
    interpretMapRollResponse(409, { message: "This will replace your map edits. Please confirm first." }),
    {
      status: "confirmation_required",
      message: "This will replace your map edits. Please confirm first.",
    },
  );
  assert.deepEqual(
    interpretMapRollResponse(409, {
      message: "This game changed in another tab. Refresh before making a new map.",
      revision: 9,
    }),
    {
      status: "conflict",
      message: "This game changed in another tab. Refresh before making a new map.",
      revision: 9,
    },
  );
  assert.deepEqual(
    interpretMapRollResponse(500, { message: "Server blew up." }),
    { status: "error", message: "Server blew up." },
  );
});

test("an unsaved setup creates its game identity before claiming a map roll", async () => {
  const inProgress = { current: false };
  let identity: { id: string; revision: number } | null = null;

  const start = await serializeMapRollStart(async () => {
    identity = { id: "new-game", revision: 1 };
    return true;
  }, inProgress);

  assert.equal(start, "ready");
  assert.deepEqual(identity, { id: "new-game", revision: 1 });
  assert.equal(inProgress.current, true);
});

test("a pending theme save completes before a map roll is claimed", async () => {
  const inProgress = { current: false };
  let persistedTheme: string | null = null;

  const start = await serializeMapRollStart(async () => {
    persistedTheme = "space";
    return true;
  }, inProgress);

  assert.equal(start, "ready");
  assert.equal(persistedTheme, "space");
});

test("an in-flight autosave hands its resulting revision to one map roll", async () => {
  const inProgress = { current: false };
  let resolveAutosave: ((saved: boolean) => void) | undefined;
  let revision = 3;
  const autosave = new Promise<boolean>((resolve) => {
    resolveAutosave = (saved) => {
      revision = 4;
      resolve(saved);
    };
  });
  const persistLatest = async () => autosave;
  let postedRevision: number | null = null;

  const first = (async () => {
    const start = await serializeMapRollStart(persistLatest, inProgress);
    if (start === "ready") postedRevision = revision;
    return start;
  })();
  const duplicate = serializeMapRollStart(persistLatest, inProgress);
  assert.equal(inProgress.current, false);

  resolveAutosave?.(true);
  assert.equal(await first, "ready");
  assert.equal(revision, 4);
  assert.equal(postedRevision, 4);
  assert.equal(await duplicate, "already_in_progress");
});

test("stale reconciliation drops every rolled-away source entry but keeps retained levels", () => {
  const retired = "custom-platformer-gen-retired";
  const replacement = "custom-platformer-gen-replacement";
  const retained = "custom-platformer-retained";
  const saved = {
    ...DEFAULT_GAME_DOCUMENT,
    mapStyle: "generated" as const,
    platformerMapSource: retired,
    platformerLevels: [
      { id: retired, templateSource: "level-1.json" as const, label: "Retired" },
      { id: retained, templateSource: "level-2.json" as const, label: "Keep me" },
    ],
  };
  const server = rolledSpecFromOutcome(saved, {
    revision: 2,
    change: mapRollChangeSchema.parse({
      previewKind: "platformer",
      platformerMapSource: replacement,
      platformerLevels: [
        { id: replacement, templateSource: "level-1.json", label: "Replacement" },
        { id: retained, templateSource: "level-2.json", label: "Keep me" },
      ],
      generatedPlatformerMaps: [{
        source: replacement,
        templateSource: "level-1.json",
        length: "medium",
        generatorVersion: "test-v1",
        map: { ...TEST_ROLLED_PLATFORMER_MAP, id: replacement },
      }],
      removedMapSources: [retired],
    }),
  });
  const local = {
    ...saved,
    platformerTerrainEdits: [
      { mapSource: retired, x: 1, y: 1, kind: "ground" as const },
      { mapSource: retained, x: 2, y: 2, kind: "ground" as const },
    ],
    platformerObjectEdits: [
      { id: "old-coin", mapSource: retired, x: 1, y: 1, kind: "coin" as const },
      { id: "kept-coin", mapSource: retained, x: 2, y: 2, kind: "coin" as const },
    ],
    platformerObjectRemovals: [
      { mapSource: retired, objectId: "old-object" },
      { mapSource: retained, objectId: "kept-object" },
    ],
    platformerObjectSettings: [
      { mapSource: retired, objectId: "old-coin", assetId: "neutral_ghost_01", behavior: "patroller" as const, direction: "left" as const },
      { mapSource: retained, objectId: "kept-coin", assetId: "neutral_ghost_01", behavior: "patroller" as const, direction: "left" as const },
    ],
    platformerLevelArt: [
      { mapSource: retired, slot: "platform" as const, world: "space_orbital_outpost_01" as const },
      { mapSource: retained, slot: "platform" as const, world: "space_orbital_outpost_01" as const },
    ],
  };

  const reconciled = reconcilePersistedGame(server, saved, local);
  assert.equal(reconciled.platformerMapSource, replacement);
  assert.deepEqual(reconciled.platformerLevels, server.platformerLevels);
  for (const entries of [
    reconciled.platformerTerrainEdits,
    reconciled.platformerObjectEdits,
    reconciled.platformerObjectRemovals,
    reconciled.platformerObjectSettings,
    reconciled.platformerLevelArt,
  ]) {
    assert.deepEqual(entries.map((entry) => entry.mapSource), [retained]);
  }
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

test("confirmed server re-roll mints a fresh source and prunes old edits", async () => {
  await withMemory(async () => {
    const game = await createGame("owner-a", { title: "Re-roll UI", spec: DEFAULT_GAME_DOCUMENT });
    const first = await rollGameMap("owner-a", game.id, { length: "medium", reason: "setup" });
    assert.equal(first.status, "rolled");
    if (first.status !== "rolled") return;
    const source = first.result.change.platformerMapSource!;
    const current = await getGame("owner-a", game.id);
    assert.ok(current);
    const edited = await updateGame("owner-a", game.id, {
      title: current.title,
      spec: {
        ...current.spec,
        platformerTerrainEdits: [{ mapSource: source, x: 2, y: 2, kind: "ground" }],
      },
      expectedRevision: current.revision,
    });
    assert.equal(edited.status, "updated");
    if (edited.status !== "updated") return;

    const refused = await rollGameMap("owner-a", game.id, {
      length: "medium",
      reason: "reroll",
      expectedRevision: edited.game.revision,
    });
    assert.equal(refused.status, "confirmation_required");
    assert.equal((await getGame("owner-a", game.id))?.spec.platformerTerrainEdits.length, 1);

    const rerolled = await rollGameMap("owner-a", game.id, {
      length: "medium",
      reason: "reroll",
      confirmDiscardEdits: true,
      expectedRevision: edited.game.revision,
    });
    assert.equal(rerolled.status, "rolled");
    if (rerolled.status !== "rolled") return;

    const applied = rolledSpecFromOutcome(edited.game.spec, rerolled.result, { mapLength: "medium" });
    assert.notEqual(activeMapSource(applied), source);
    assert.equal(applied.platformerTerrainEdits.length, 0);
  });
});

test("maze re-roll length falls back to stored map length for ready-made levels", () => {
  const spec = {
    ...DEFAULT_GAME_DOCUMENT,
    previewKind: "maze" as const,
    mazeMapSource: "maze_space_01.json" as const,
    mapLength: "long" as const,
  };
  assert.equal(activeMapRollLength(spec), "long");
});

test("build-turn response parses an optional map roll payload", () => {
  const change = mapRollChangeSchema.parse({
    previewKind: "platformer",
    platformerMapSource: "custom-platformer-gen-parse",
    generatedPlatformerMaps: [{
      source: "custom-platformer-gen-parse",
      templateSource: "level-1.json",
      length: "short",
      generatorVersion: "test-v1",
      map: { ...TEST_ROLLED_PLATFORMER_MAP, id: "custom-platformer-gen-parse" },
    }],
  });
  assert.deepEqual(
    parseBuildTurnResult(
      {
        status: "replied",
        cooperMessage: "Different map!",
        runId: "run-1",
        mapRoll: { revision: 7, change },
      },
      "7",
    ),
    {
      status: "replied",
      cooperMessage: "Different map!",
      runId: "run-1",
      revision: 7,
      mapRoll: { revision: 7, change },
    },
  );
});

test("build-turn response requires the declared response and revision header", () => {
  assert.deepEqual(
    parseBuildTurnResult(
      { status: "replied", cooperMessage: "Done!", runId: "run-1" },
      "14",
    ),
    { status: "replied", cooperMessage: "Done!", runId: "run-1", revision: 14 },
  );
  assert.equal(
    parseBuildTurnResult({ status: "nope", cooperMessage: "Done!", runId: "run-1" }, "14"),
    null,
  );
  assert.equal(
    parseBuildTurnResult(
      { status: "replied", cooperMessage: "Done!", runId: "run-1" },
      null,
    ),
    null,
  );
});
