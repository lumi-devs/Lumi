import { s, type BaseValidator } from "@sapphire/shapeshift";

// Shared by both `core-rpc.ts` and the dashboard's `modules/dashboard/rpc/*`
// handlers so payload validation and pagination stay identical across every
// RPC surface instead of being redefined per file.

export const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

export function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

export const MAX_PAGE_SIZE = 100;
export const PageSchema = s.number().int().greaterThanOrEqual(1).optional();
export const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(MAX_PAGE_SIZE)
  .optional();

export function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
