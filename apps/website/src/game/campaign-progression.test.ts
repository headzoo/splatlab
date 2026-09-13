import assert from "node:assert/strict";
import test from "node:test";

import physics from "../../../game/game-physics/platformer_small_01.json";
import shortSword from "../../../game/weapon-specs/short_sword_v1.json";
import { DEFAULT_GAME_DOCUMENT, type GameDocument } from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import {
  campaignMapIndex,
  FIRST_LEVEL_INDEX,
  gameCampaignMaps,
  levelCompletionMessage,
  levelProgressLabel,
} from "./game-levels";
import type { CampaignMap } from "./game-player";
import { nextCampaignMapIndex } from "./platformer/campaign";
import {
  createInitialState,
  resolveStartingLives,
  stepPlatformer,
} from "./platformer/engine";
import { applyPlatformerRules } from "./platformer/map-editing";
import type {
  PlatformerMapSpec,
  PlatformerPhysicsSpec,
  PlatformerState,
  WeaponSpec,
} from "./platformer/types";

const gamePhysics = physics as unknown as PlatformerPhysicsSpec;
const weapon = shortSword as unknown as WeaponSpec;
const idleInput = {
  moveX: 0,
  moveY: 0,
  jumpPressed: false,
  jumpHeld: false,
  weaponPressed: false,
};

// A five-level game saved from /build, sitting on its second level the way the
// builder leaves it when the last edit happened there.
const sharedGame: GameDocument = {
  ...DEFAULT_GAME_DOCUMENT,
  platformerMapSource: "custom-platformer-123e4567-e89b-12d3-a456-426614174002",
  platformerLevels: [
    { id: "custom-platformer-123e4567-e89b-12d3-a456-426614174001", templateSource: "level-1.json", label: "Green Hills 1" },
    { id: "custom-platformer-123e4567-e89b-12d3-a456-426614174002", templateSource: "level-3.json", label: "Graveyard 1" },
    { id: "custom-platformer-123e4567-e89b-12d3-a456-426614174003", templateSource: "level-2.json", label: "Space 1" },
    { id: "custom-platformer-123e4567-e89b-12d3-a456-426614174004", templateSource: "level-4.json", label: "Dragon World 1" },
    { id: "custom-platformer-123e4567-e89b-12d3-a456-426614174005", templateSource: "level-5.json", label: "Ice World 1" },
  ],
};

// Plays a level the way a winning run ends: every boss down, then either the
// hero stands on the goal or the last boss falls on a boss-only map.
function completeLevel(
  map: PlatformerMapSpec,
  runSoFar: Partial<PlatformerState> = {},
): PlatformerState {
  const initial = { ...createInitialState(map), ...runSoFar };
  const goal = map.objects.find((object) => object.type === "goal");
  const bosses = initial.enemies.filter((enemy) => enemy.role === "boss");
  assert.ok(
    goal || bosses.length > 0,
    `${map.id} has neither a goal nor a boss, so it can never be completed`,
  );

  if (goal) {
    const atTheGoal: PlatformerState = {
      ...initial,
      x: (goal.x + 0.5) * map.tileSize,
      y: (goal.y + 1) * map.tileSize,
      enemies: initial.enemies.map((enemy) => enemy.role === "boss"
        ? { ...enemy, defeated: true }
        : enemy),
    };
    return stepPlatformer(map, gamePhysics, atTheGoal, idleInput, weapon).state;
  }

  const lastBoss = bosses[bosses.length - 1];
  let state: PlatformerState = {
    ...initial,
    x: lastBoss.x - 80,
    y: lastBoss.y,
    previousY: lastBoss.y,
    grounded: true,
    facing: "right",
    enemies: initial.enemies.map((enemy) => {
      if (enemy.role !== "boss") return enemy;
      return enemy.id === lastBoss.id
        ? { ...enemy, hitsRemaining: 1 }
        : { ...enemy, defeated: true };
    }),
  };
  for (let tick = 0; tick < 8 && state.status === "playing"; tick += 1) {
    const result = stepPlatformer(
      map,
      gamePhysics,
      state,
      { ...idleInput, weaponPressed: tick === 0 },
      weapon,
    );
    state = result.state;
    if (result.events.some((event) => event.type === "weapon_hit")) break;
  }
  return state;
}

test("a shared game plays its levels in the authored order from the first one", () => {
  const campaignMaps = gameCampaignMaps(sharedGame, GAME_PLAYER_CONTENT.maps);

  assert.deepEqual(campaignMaps.map((level) => level.label), [
    "Green Hills 1",
    "Graveyard 1",
    "Space 1",
    "Dragon World 1",
    "Ice World 1",
  ]);
  // The builder's saved level is the second one, but sharing starts at level 1.
  assert.equal(campaignMapIndex(sharedGame, campaignMaps), 1);
  assert.equal(FIRST_LEVEL_INDEX, 0);
});

test("beating a checked-in level advances the shared game to the next one", () => {
  const campaignMaps = gameCampaignMaps(sharedGame, GAME_PLAYER_CONTENT.maps);
  const played: string[] = [];
  let index: number | null = FIRST_LEVEL_INDEX;

  while (index !== null) {
    const level: CampaignMap | undefined = campaignMaps[index];
    assert.ok(level, `level ${index} is missing from the shared game`);
    played.push(level.label);
    assert.equal(
      completeLevel(level.map).status,
      "won",
      `${level.label} could not be completed`,
    );
    index = nextCampaignMapIndex(index, campaignMaps.length);
  }

  assert.deepEqual(played, campaignMaps.map((level) => level.label));
});

test("a shared game keeps the lives it has left but restarts each level's coins", () => {
  const campaignMaps = gameCampaignMaps(sharedGame, GAME_PLAYER_CONTENT.maps);
  const firstLevel = campaignMaps[0].map;
  const secondLevel = campaignMaps[1].map;
  const coin = firstLevel.objects.find((object) => object.type === "collectible");
  assert.ok(coin);

  // Fall off the bottom of the map, which costs one of the three lives.
  const fell = stepPlatformer(firstLevel, gamePhysics, {
    ...createInitialState(firstLevel),
    y: (firstLevel.size.rows + 2) * firstLevel.tileSize,
  }, idleInput, weapon).state;
  assert.equal(fell.lives, resolveStartingLives(firstLevel) - 1);

  const won = completeLevel(firstLevel, {
    lives: fell.lives,
    collectedIds: [coin.id],
    score: 1,
  });
  assert.equal(won.status, "won");

  const nextLevel = applyPlatformerRules(secondLevel, won.lives);
  const nextStart = createInitialState(nextLevel);

  assert.equal(won.lives, 2);
  assert.equal(nextStart.lives, 2, "the next level starts with the lives the player has left");
  assert.notEqual(nextStart.lives, resolveStartingLives(secondLevel));
  assert.deepEqual(nextStart.collectedIds, [], "coins start over on every level");
  assert.equal(nextStart.score, 0);
});

test("the shared player names the current level and celebrates the last one", () => {
  const total = gameCampaignMaps(sharedGame, GAME_PLAYER_CONTENT.maps).length;

  assert.equal(levelProgressLabel(0, total, "Green Hills 1"), "Level 1 of 5 · Green Hills 1");
  assert.equal(levelProgressLabel(4, total, "Ice World 1"), "Level 5 of 5 · Ice World 1");
  assert.equal(levelCompletionMessage(0, total, "Level complete!"), "Level complete!");
  assert.equal(levelCompletionMessage(4, total, "Level complete!"), "You beat the game!");
  // A one-level game keeps its original wording.
  assert.equal(levelProgressLabel(0, 1, "Green Hills 1"), "Green Hills 1");
  assert.equal(levelCompletionMessage(0, 1, "Level complete!"), "Level complete!");
});
