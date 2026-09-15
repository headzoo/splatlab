-- Video fields are nullable so deployed screenshot rows remain unchanged.
ALTER TABLE "media_asset"
ADD COLUMN "poster_url" TEXT,
ADD COLUMN "poster_pathname" TEXT,
ADD COLUMN "duration_ms" INTEGER,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

CREATE UNIQUE INDEX "media_asset_poster_pathname_key"
ON "media_asset"("poster_pathname");

-- The prior screenshot constraint is deliberately retained. This additional
-- constraint gives each video its independent 24-slot owner/kind namespace and
-- permits old screenshot rows without video-only metadata.
ALTER TABLE "media_asset"
ADD CONSTRAINT "media_asset_video_quota_slot_check"
CHECK (
  "kind" <> 'video'
  OR ("quota_slot" IS NOT NULL AND "quota_slot" BETWEEN 0 AND 23)
) NOT VALID;

ALTER TABLE "media_asset"
ADD CONSTRAINT "media_asset_ready_video_metadata_check"
CHECK (
  "kind" <> 'video'
  OR "ready_at" IS NULL
  OR (
    "content_type" = 'video/mp4'
    AND "byte_size" > 0
    AND "poster_url" IS NOT NULL
    AND "poster_pathname" IS NOT NULL
    AND "duration_ms" BETWEEN 1 AND 10000
    AND "width" BETWEEN 2 AND 1920
    AND "height" BETWEEN 2 AND 1920
  )
) NOT VALID;
