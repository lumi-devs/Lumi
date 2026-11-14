ALTER TABLE "permits" ADD COLUMN "nodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "permits" SET "nodes" = ARRAY["node"];
ALTER TABLE "permits" ALTER COLUMN "nodes" DROP DEFAULT;
ALTER TABLE "permits" DROP COLUMN "node";
