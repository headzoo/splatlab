import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "@/lib/game-contract";

import {
  setupQuestionHistoryFromSpec,
  setupSelectionsFromSpec,
} from "./build-setup";

test("a new unsaved game has no locked setup answers", () => {
  assert.deepEqual(setupSelectionsFromSpec(null), {
    gameType: null,
    theme: null,
    character: null,
    humanGender: null,
    skinTone: null,
    hairColor: null,
  });
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
      character: null,
      humanGender: null,
      skinTone: null,
      hairColor: null,
    },
  );
});

test("a completed human setup restores gender and appearance answers", () => {
  assert.deepEqual(
    setupSelectionsFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: "level-3.json",
      playerCharacter: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
      setupStep: "complete",
    }),
    {
      gameType: "platformer",
      theme: "graveyard",
      character: "human",
      humanGender: "girl",
      skinTone: "skin_01",
      hairColor: "hair_06",
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
      character: "robot",
      humanGender: null,
      skinTone: null,
      hairColor: null,
    },
  );
});

test("legacy games reconstruct their setup transcript from the saved step", () => {
  assert.deepEqual(
    setupQuestionHistoryFromSpec({
      ...DEFAULT_GAME_DOCUMENT,
      builderSetupHistory: [],
      playerCharacter: "human",
      setupStep: "hairColor",
    }),
    ["gameType", "theme", "character", "humanGender", "skinTone", "hairColor"],
  );
});
