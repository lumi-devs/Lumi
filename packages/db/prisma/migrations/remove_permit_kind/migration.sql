-- Remove the old "kind" column from permits table (v1 legacy)
ALTER TABLE "permits" DROP COLUMN IF EXISTS "kind";

-- Also drop the PermitKind enum type if it exists
DROP TYPE IF EXISTS "PermitKind";