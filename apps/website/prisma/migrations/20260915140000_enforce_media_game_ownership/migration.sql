-- A media row may reference only a game owned by the same user. The duplicate
-- nullable owner column lets the composite foreign key retain ON DELETE SET
-- NULL behavior without clearing the media row's actual owner.
ALTER TABLE "game"
ADD CONSTRAINT "game_id_owner_id_key" UNIQUE ("id", "owner_id");

ALTER TABLE "media_asset"
ADD COLUMN "game_owner_id" TEXT;

-- Remove any cross-owner associations created before ownership was enforced,
-- then backfill the validated relation owner for legitimate associations.
UPDATE "media_asset" AS media
SET "game_id" = NULL
WHERE media."game_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "game"
    WHERE "game"."id" = media."game_id"
      AND "game"."owner_id" = media."owner_id"
  );

UPDATE "media_asset"
SET "game_owner_id" = "owner_id"
WHERE "game_id" IS NOT NULL;

ALTER TABLE "media_asset"
ADD CONSTRAINT "media_asset_game_owner_pair_check"
CHECK (
  ("game_id" IS NULL AND "game_owner_id" IS NULL)
  OR (
    "game_id" IS NOT NULL
    AND "game_owner_id" IS NOT NULL
    AND "game_owner_id" = "owner_id"
  )
);

ALTER TABLE "media_asset"
DROP CONSTRAINT "media_asset_game_id_fkey";

ALTER TABLE "media_asset"
ADD CONSTRAINT "media_asset_game_owner_fkey"
FOREIGN KEY ("game_id", "game_owner_id")
REFERENCES "game"("id", "owner_id")
ON DELETE SET NULL
ON UPDATE CASCADE;
