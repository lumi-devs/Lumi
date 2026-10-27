DROP TABLE "installed_addons";

CREATE TABLE "downloader_repos" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "url" VARCHAR(200) NOT NULL,
    "branch" VARCHAR(64),
    "commit" VARCHAR(40),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downloader_repos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "downloader_repos_name_key" ON "downloader_repos"("name");

CREATE TABLE "downloader_modules" (
    "name" VARCHAR(64) NOT NULL,
    "repo_id" INTEGER NOT NULL,
    "version" VARCHAR(32),
    "commit" VARCHAR(40),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloader_modules_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "downloader_modules_repo_id_idx" ON "downloader_modules"("repo_id");

ALTER TABLE "downloader_modules" ADD CONSTRAINT "downloader_modules_repo_id_fkey"
    FOREIGN KEY ("repo_id") REFERENCES "downloader_repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
