ALTER TABLE "media_asset"
ADD COLUMN "quota_slot" INTEGER,
ADD COLUMN "ready_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP;

WITH ranked_screenshots AS (
    SELECT
        "id",
        (ROW_NUMBER() OVER (
            PARTITION BY "owner_id", "kind"
            ORDER BY "created_at", "id"
        ) - 1)::INTEGER AS "quota_slot"
    FROM "media_asset"
    WHERE "kind" = 'screenshot'
)
UPDATE "media_asset" AS media
SET "quota_slot" = ranked."quota_slot"
FROM ranked_screenshots AS ranked
WHERE media."id" = ranked."id";

CREATE UNIQUE INDEX "media_asset_owner_kind_quota_slot_key"
ON "media_asset"("owner_id", "kind", "quota_slot");

-- Existing deployments may already contain more than 48 screenshots because
-- the former count-then-insert quota was racy. NOT VALID preserves those rows
-- while enforcing the valid slot range for every new or updated screenshot.
ALTER TABLE "media_asset"
ADD CONSTRAINT "media_asset_screenshot_quota_slot_check"
CHECK (
    "kind" <> 'screenshot'
    OR (
        "quota_slot" IS NOT NULL
        AND "quota_slot" BETWEEN 0 AND 47
    )
) NOT VALID;
