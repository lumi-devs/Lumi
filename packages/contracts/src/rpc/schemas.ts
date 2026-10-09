import { z } from "zod";

export const SnowflakeSchema = z.string().regex(/^\d{17,20}$/);

export function boundedArray<T>(
  item: z.ZodType<T>,
  bounds: { min?: number; max?: number },
): z.ZodType<T[]> {
  const { min = 0, max = Number.POSITIVE_INFINITY } = bounds;
  let schema = z.array(item);
  if (min > 0) schema = schema.min(min);
  if (Number.isFinite(max)) schema = schema.max(max);
  return schema;
}

export const PageSchema = z.number().int().gte(1).optional();

export const PageSizeSchema = z.number().int().gte(1).lte(100).optional();

/**
 * Opaque keyset-pagination cursor - a base64url string, never interpreted by
 * the caller. Bounded well above any real encoded cursor's length so a
 * malformed/oversized value fails schema validation before it ever reaches
 * `decodeCreatedAtIdCursor`/`decodeSingleKeyCursor`.
 */
export const CursorSchema = z.string().min(1).max(512).optional();

export const ModuleNameSchema = z.string().min(1).max(64);

export const ConfigKeySchema = z.string().min(1).max(64);

export const PaginationSchema = z.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const AuditFilterShape = {
  userId: SnowflakeSchema.optional(),
  action: z.string().min(1).max(128).optional(),
  platform: z.enum(["discord", "web"] as const).optional(),
  pageSize: PageSizeSchema,
  cursor: CursorSchema,
};

export const BlocklistAddSchema = z.object({
  userId: SnowflakeSchema,
  reason: z.string().max(500).optional(),
});

export const BlocklistRemoveSchema = z.object({
  userId: SnowflakeSchema,
});

export const FeatureFlagKeySchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{0,98}[a-z0-9])?$/);

export const RolloutPercentSchema = z.number().int().gte(0).lte(100);
