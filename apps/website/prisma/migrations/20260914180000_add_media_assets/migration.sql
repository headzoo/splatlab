CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "game_id" TEXT,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_asset_pathname_key" ON "media_asset"("pathname");
CREATE INDEX "media_asset_owner_id_created_at_idx" ON "media_asset"("owner_id", "created_at" DESC);

ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
