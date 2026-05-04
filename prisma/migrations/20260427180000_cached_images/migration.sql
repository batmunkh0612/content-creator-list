-- Persistent cache table for proxied IG images.
CREATE TABLE "cached_images" (
    "urlHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 200,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cached_images_pkey" PRIMARY KEY ("urlHash")
);

CREATE INDEX "cached_images_fetchedAt_idx" ON "cached_images"("fetchedAt");
CREATE INDEX "cached_images_expiresAt_idx" ON "cached_images"("expiresAt");
