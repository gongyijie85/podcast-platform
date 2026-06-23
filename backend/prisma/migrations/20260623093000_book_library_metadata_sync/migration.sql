ALTER TABLE "book_library_items"
  ADD COLUMN "metadata_sync_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "metadata_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "metadata_synced_at" TIMESTAMP(3),
  ADD COLUMN "metadata_sync_error" TEXT;

UPDATE "book_library_items"
SET
  "metadata_sync_status" = CASE
    WHEN "source" = 'mock'
      OR "summary" = 'GoogleBooksAdapter 离线 mock 数据。'
      OR "title" LIKE 'GoogleBooks 占位 (%'
      OR "summary" IS NULL
    THEN 'pending'
    ELSE 'synced'
  END,
  "metadata_synced_at" = CASE
    WHEN "source" = 'mock'
      OR "summary" = 'GoogleBooksAdapter 离线 mock 数据。'
      OR "title" LIKE 'GoogleBooks 占位 (%'
      OR "summary" IS NULL
    THEN NULL
    ELSE "last_seen_at"
  END;

CREATE INDEX "book_library_items_metadata_sync_status_idx"
  ON "book_library_items"("metadata_sync_status");
