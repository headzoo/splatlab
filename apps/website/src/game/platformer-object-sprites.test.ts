import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "@/app/game-assets/[...asset]/route";
import {
  activePlayerAssetId,
  DEFAULT_GAME_DOCUMENT,
  HUMAN_GENDERS,
  PLATFORMER_OBJECT_KINDS,
  PLAYER_CHARACTERS,
} from "@/lib/game-contract";

import { GAME_PLAYER_CONTENT } from "./game-player-content";
import { ART_WORLDS } from "./platformer/art-catalog";
import { platformerObjectSpriteFrame } from "./platformer/object-sprites";

/** The pixel size recorded in a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array) {
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: header.getUint32(16), height: header.getUint32(20) };
}

/**
 * Fetches a sprite through the same route the builder buttons request, so an
 * asset missing from the served catalog fails here instead of rendering as an
 * empty swatch.
 */
async function servedSpriteSize(assetId: string) {
  const filename = `${assetId}.png`;
  const response = await GET(
    new Request(`http://localhost/game-assets/sprites/${filename}`),
    { params: Promise.resolve({ asset: ["sprites", filename] }) },
  );
  assert.equal(response.status, 200, filename);
  return pngSize(new Uint8Array(await response.arrayBuffer()));
}

async function assertFrameFitsSheet(
  frame: ReturnType<typeof platformerObjectSpriteFrame>,
  label: string,
) {
  const size = await servedSpriteSize(frame.assetId);
  assert.equal(size.width, frame.columns * frame.frameWidth, `${label} width`);
  assert.equal(size.height, frame.rows * frame.frameHeight, `${label} height`);
}

test("every object button previews a real frame of the sprite its map uses", async () => {
  for (const { source, map } of GAME_PLAYER_CONTENT.maps) {
    const playerAssetId = activePlayerAssetId({
      ...DEFAULT_GAME_DOCUMENT,
      platformerMapSource: source,
    });
    for (const kind of PLATFORMER_OBJECT_KINDS) {
      const frame = platformerObjectSpriteFrame(
        map.presentation,
        kind,
        playerAssetId,
      );
      await assertFrameFitsSheet(frame, `${source} ${kind} ${frame.assetId}`);
    }
  }
});

test("the spawn button previews whichever hero the game is set to", async () => {
  for (const { source } of GAME_PLAYER_CONTENT.maps) {
    for (const playerCharacter of PLAYER_CHARACTERS) {
      for (const humanGender of HUMAN_GENDERS) {
        const playerAssetId = activePlayerAssetId({
          ...DEFAULT_GAME_DOCUMENT,
          platformerMapSource: source,
          playerCharacter,
          humanGender,
        });
        const frame = platformerObjectSpriteFrame(
          { backgroundId: "ignored_background_01" },
          "spawn",
          playerAssetId,
        );
        assert.equal(frame.assetId, playerAssetId);
        await assertFrameFitsSheet(
          frame,
          `${source} ${playerCharacter} ${humanGender} ${playerAssetId}`,
        );
      }
    }
  }
});

/**
 * The Objects dropdown on /build repaints the buttons, so a kid on Green Hills
 * sees the Graveyard chest they are about to place rather than their own.
 */
test("an object button previews the world the kid is painting from", async () => {
  const greenHills = { backgroundId: "neutral_green_hills_01" };
  for (const world of ART_WORLDS) {
    for (const kind of PLATFORMER_OBJECT_KINDS) {
      const frame = platformerObjectSpriteFrame(
        greenHills,
        kind,
        "neutral_cooper_01",
        world.id,
      );
      await assertFrameFitsSheet(frame, `${world.id} ${kind} ${frame.assetId}`);
      if (kind === "spawn" || kind === "extra_life") continue;
      assert.equal(
        frame.assetId,
        platformerObjectSpriteFrame({ backgroundId: world.id }, kind, "neutral_cooper_01")
          .assetId,
        `${world.id} ${kind} matches how that world dresses it`,
      );
    }
  }
});

test("painting from the level's own world leaves the buttons alone", () => {
  const graveyard = { backgroundId: "haunted_graveyard_01" as const };
  for (const kind of PLATFORMER_OBJECT_KINDS) {
    assert.deepEqual(
      platformerObjectSpriteFrame(graveyard, kind, "haunted_cooper_01", "haunted_graveyard_01"),
      platformerObjectSpriteFrame(graveyard, kind, "haunted_cooper_01"),
      kind,
    );
  }
});

test("an unthemed background falls back to the Green Hills object sprites", () => {
  for (const kind of PLATFORMER_OBJECT_KINDS) {
    assert.deepEqual(
      platformerObjectSpriteFrame(
        { backgroundId: "not_a_background_01" },
        kind,
        "neutral_cooper_01",
      ),
      platformerObjectSpriteFrame(
        { backgroundId: "neutral_green_hills_01" },
        kind,
        "neutral_cooper_01",
      ),
      kind,
    );
  }
});
