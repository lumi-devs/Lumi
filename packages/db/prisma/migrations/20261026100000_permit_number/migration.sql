ALTER TABLE "permits" ADD COLUMN "number" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "guild_id" ORDER BY "position", "id") AS "number"
  FROM "permits"
)
UPDATE "permits"
SET "number" = numbered."number"
FROM numbered
WHERE "permits"."id" = numbered."id";

ALTER TABLE "permits" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "permits_guild_id_number_key" ON "permits"("guild_id", "number");
