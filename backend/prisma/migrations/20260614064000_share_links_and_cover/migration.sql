ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "cover_url" TEXT;

CREATE TABLE IF NOT EXISTS "share_links" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_key" ON "share_links"("token");
CREATE INDEX IF NOT EXISTS "share_links_project_id_idx" ON "share_links"("project_id");
CREATE INDEX IF NOT EXISTS "share_links_expires_at_idx" ON "share_links"("expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'share_links_project_id_fkey'
  ) THEN
    ALTER TABLE "share_links"
      ADD CONSTRAINT "share_links_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
