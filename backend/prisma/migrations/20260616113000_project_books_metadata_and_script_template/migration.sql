ALTER TABLE "projects"
ADD COLUMN "script_template" TEXT;

ALTER TABLE "project_books"
ADD COLUMN "publisher" TEXT,
ADD COLUMN "published_date" TEXT,
ADD COLUMN "metadata_source" TEXT,
ADD COLUMN "podcast_angle" TEXT;
