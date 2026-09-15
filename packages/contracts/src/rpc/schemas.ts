import { s } from "@sapphire/shapeshift";

export const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

export const PageSchema = s.number().int().greaterThanOrEqual(1).optional();

export const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(100)
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
  page: PageSchema,
  pageSize: PageSizeSchema,
};

export const BlocklistAddSchema = s.object({
  userId: SnowflakeSchema,
  reason: s.string().lengthLessThanOrEqual(500).optional(),
});

export const BlocklistRemoveSchema = s.object({
  userId: SnowflakeSchema,
});
