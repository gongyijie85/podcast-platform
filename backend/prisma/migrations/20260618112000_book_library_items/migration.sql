CREATE TABLE "book_library_items" (
    "id" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "cover_url" TEXT,
    "summary" TEXT,
    "publisher" TEXT,
    "published_date" TEXT,
    "page_count" INTEGER,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "category_name" TEXT,
    "rank" INTEGER,
    "query_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_library_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "book_library_items_isbn_key" ON "book_library_items"("isbn");
CREATE INDEX "book_library_items_source_idx" ON "book_library_items"("source");
CREATE INDEX "book_library_items_category_idx" ON "book_library_items"("category");
CREATE INDEX "book_library_items_last_seen_at_idx" ON "book_library_items"("last_seen_at");
