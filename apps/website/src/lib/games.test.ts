import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GAME_DOCUMENT } from "./game-contract";
import {
  createGame,
  deleteGame,
  getGame,
  getPublicGame,
  listGames,
  saveGameThumbnail,
  updateGame,
} from "./games";

const TEST_THUMBNAIL = "data:image/webp;base64,UklGRg==";

test("game CRUD is owner-scoped and revision guarded", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const created = await createGame("owner-a", {
      title: "Green Hills Platformer",
      spec: DEFAULT_GAME_DOCUMENT,
    });

    assert.equal((await listGames("owner-a")).length, 1);
    assert.equal(await getGame("owner-b", created.id), null);
    assert.equal((await getPublicGame(created.id))?.id, created.id);
    assert.equal(created.thumbnailDataUrl, null);

    assert.equal(
      await saveGameThumbnail("owner-b", created.id, TEST_THUMBNAIL),
      false,
    );
    assert.equal(
      await saveGameThumbnail("owner-a", created.id, TEST_THUMBNAIL),
      true,
    );
    assert.equal(
      (await listGames("owner-a"))[0]?.thumbnailDataUrl,
      TEST_THUMBNAIL,
    );
    assert.equal(
      (await getGame("owner-a", created.id))?.thumbnailDataUrl,
      TEST_THUMBNAIL,
    );

    const mazeSpec = { ...DEFAULT_GAME_DOCUMENT, previewKind: "maze" as const };
    const updated = await updateGame("owner-a", created.id, {
      title: "Green Hills Maze",
      spec: mazeSpec,
      expectedRevision: created.revision,
    });
    assert.equal(updated.status, "updated");
    if (updated.status !== "updated") return;
    assert.equal(updated.game.revision, 2);
    assert.equal(updated.game.mapSource, "maze_green_hills_01.json");

    const conflict = await updateGame("owner-a", created.id, {
      title: "Stale title",
      spec: DEFAULT_GAME_DOCUMENT,
      expectedRevision: created.revision,
    });
    assert.equal(conflict.status, "conflict");
    assert.equal(await deleteGame("owner-b", created.id), false);
    assert.equal(await deleteGame("owner-a", created.id), true);
    assert.equal(await getGame("owner-a", created.id), null);
    assert.equal(await getPublicGame(created.id), null);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
