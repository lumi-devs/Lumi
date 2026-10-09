import { CodedRpcError, RpcFailureCodes } from "@lumi/contracts/rpc";

/**
 * Keyset (cursor) pagination helpers shared by the repositories that list
 * unbounded per-guild tables (audit log, moderation cases, appeals, config
 * history). A cursor is an opaque, base64url-encoded JSON tuple of the sort
 * key's value(s) - never a raw offset - so a client can hold it across pages
 * without the row-count drift a `skip`-based page suffers as new rows land.
 */

const MAX_CURSOR_LENGTH = 512;

function invalidCursor(): CodedRpcError {
  return new CodedRpcError(RpcFailureCodes.BadRequest, "Invalid pagination cursor");
}

function encode(parts: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function decode(cursor: string, arity: number): unknown[] {
  if (typeof cursor !== "string" || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw invalidCursor();
  }
  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw invalidCursor();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(parsed) || parsed.length !== arity) throw invalidCursor();
  return parsed;
}

export interface CreatedAtIdCursor {
  createdAt: Date;
  id: number;
}

/** Encodes the `(createdAt, id)` sort key of the last row on a page. */
export function encodeCreatedAtIdCursor(row: { createdAt: Date; id: number }): string {
  return encode([row.createdAt.toISOString(), row.id]);
}

/** Decodes and validates a `(createdAt, id)` cursor - throws a `BadRequest` `CodedRpcError` if malformed. */
export function decodeCreatedAtIdCursor(cursor: string): CreatedAtIdCursor {
  const [createdAtRaw, idRaw] = decode(cursor, 2);
  if (typeof createdAtRaw !== "string" || typeof idRaw !== "number" || !Number.isInteger(idRaw)) {
    throw invalidCursor();
  }
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) throw invalidCursor();
  return { createdAt, id: idRaw };
}

/**
 * Prisma `where` fragment matching rows strictly before `cursor` in a
 * `(createdAt desc, id desc)` order - the tie-break on `id` is what keeps
 * paging stable across rows sharing the same `createdAt` (millisecond
 * collisions are routine for bulk-inserted rows like flushed audit batches).
 */
export function createdAtIdKeysetWhere(cursor: CreatedAtIdCursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Matching `orderBy` for `createdAtIdKeysetWhere` - descending, `id` breaking ties. */
export const CreatedAtIdOrderBy = [
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

/** Encodes a single-column descending cursor (e.g. a per-guild unique `caseNumber`). */
export function encodeSingleKeyCursor(value: number): string {
  return encode([value]);
}

/** Decodes and validates a single-column cursor - throws a `BadRequest` `CodedRpcError` if malformed. */
export function decodeSingleKeyCursor(cursor: string): number {
  const [value] = decode(cursor, 1);
  if (typeof value !== "number" || !Number.isInteger(value)) throw invalidCursor();
  return value;
}

/** Prisma `where` fragment for "`field` strictly less than `value`", for a single-key descending cursor. */
export function singleKeyKeysetWhere(
  field: string,
  value: number,
): Record<string, { lt: number }> {
  return { [field]: { lt: value } };
}

/** Splits `take + 1` fetched rows into the page and whether a next page exists. */
export function splitPage<T>(rows: T[], take: number): { page: T[]; hasMore: boolean } {
  if (rows.length > take) return { page: rows.slice(0, take), hasMore: true };
  return { page: rows, hasMore: false };
}

export interface KeysetPagedResult<T> {
  rows: T[];
  total?: number;
  nextCursor: string | null;
}

export async function paginateCreatedAtId<T extends { createdAt: Date; id: number }>(
  fetchRows: (where: unknown) => Promise<T[]>,
  countTotal: (where: unknown) => Promise<number>,
  baseWhere: Record<string, unknown>,
  filter: { cursor?: string; take?: number },
): Promise<KeysetPagedResult<T>> {
  const take = filter.take ?? 25;
  const where =
    filter.cursor !== undefined
      ? { ...baseWhere, ...createdAtIdKeysetWhere(decodeCreatedAtIdCursor(filter.cursor)) }
      : baseWhere;

  const [rawRows, total] = await Promise.all([
    fetchRows(where),
    filter.cursor === undefined ? countTotal(baseWhere) : undefined,
  ]);
  const { page, hasMore } = splitPage(rawRows, take);
  const last = page.at(-1);
  return {
    rows: page,
    total,
    nextCursor: hasMore && last ? encodeCreatedAtIdCursor(last) : null,
  };
}
