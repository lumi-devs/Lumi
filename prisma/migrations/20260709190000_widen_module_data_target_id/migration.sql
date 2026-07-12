-- Widen module_dynamic_data.target_id: addons legitimately key rows by
-- module-defined identifiers (prefixed message IDs like `r:<snowflake>`,
-- salted author hashes, etc.) that exceed the original 20-char Discord-ID cap.
ALTER TABLE "module_dynamic_data" ALTER COLUMN "target_id" TYPE VARCHAR(191);
