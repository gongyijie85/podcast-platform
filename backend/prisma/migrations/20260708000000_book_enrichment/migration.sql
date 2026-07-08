ALTER TABLE "book_library_items"
  ADD COLUMN "enrichment" JSONB,
  ADD COLUMN "enrichment_updated_at" TIMESTAMP(3);
