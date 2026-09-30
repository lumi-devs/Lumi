import { Result, s, type BaseValidator } from "@sapphire/shapeshift";

export const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

/** shapeshift's array length constraints narrow the type to tuples, which
 * callers holding a plain array can't satisfy; this checks the bounds and keeps `T[]`. */
export function boundedArray<T>(
  item: BaseValidator<T>,
  bounds: { min?: number; max?: number },
) {
  const { min = 0, max = Number.POSITIVE_INFINITY } = bounds;
  return s.array(item).reshape((items): Result<T[]> => {
    if (items.length < min) {
      return Result.err(new RangeError(`Expected at least ${min} items`));
    }
    if (items.length > max) {
      return Result.err(new RangeError(`Expected at most ${max} items`));
    }
    return Result.ok(items);
  });
}

export const PageSchema = s.number().int().greaterThanOrEqual(1).optional();

export const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(100)
  .optional();

/**
 * Opaque keyset-pagination cursor - a base64url string, never interpreted by
 * the caller. Bounded well above any real encoded cursor's length so a
 * malformed/oversized value fails schema validation before it ever reaches
 * `decodeCreatedAtIdCursor`/`decodeSingleKeyCursor`.
 */
export const CursorSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(512)
  .optional();

export const ModuleNameSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);

export const ConfigKeySchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);

export const PaginationSchema = s.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const AuditFilterShape = {
  userId: SnowflakeSchema.optional(),
  action: s
    .string()
    .lengthGreaterThanOrEqual(1)
    .lengthLessThanOrEqual(128)
    .optional(),
  platform: s.enum(["discord", "web"] as const).optional(),
  pageSize: PageSizeSchema,
  cursor: CursorSchema,
};

export const BlocklistAddSchema = s.object({
  userId: SnowflakeSchema,
  reason: s.string().lengthLessThanOrEqual(500).optional(),
});

export const BlocklistRemoveSchema = s.object({
  userId: SnowflakeSchema,
});
