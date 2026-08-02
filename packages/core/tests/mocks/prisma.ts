/**
 * Offline in-memory Prisma mock for `bun test`.
 *
 * Mirrors the role `MockRedis` plays for `ioredis` in
 * `packages/core/tests/event-bus/event-bus.test.ts` / `packages/event-bus/tests/factory.spec.ts`:
 * a small class that stands in for the real client so tests never need a live
 * backing service (here, a real Postgres instance via docker-compose).
 *
 * It is intentionally schema-agnostic - it does not read `prisma/schema.prisma`
 * or hardcode the 24 models there. Each `prisma.<model>` access lazily gets its
 * own in-memory table (a plain array of records) the first time it's touched,
 * and supports the subset of the Prisma Client CRUD API this codebase's
 * repositories (`packages/core/src/lib/prisma/repositories/*.ts`) actually use:
 *
 *   findUnique / findFirst / findMany / count
 *   create / createMany
 *   update / updateMany / upsert
 *   delete / deleteMany
 *   $transaction (array form and interactive callback form)
 *
 * ### Usage
 *
 * ```ts
 * import { createMockPrismaClient } from "../mocks/prisma.js";
 *
 * const prisma = createMockPrismaClient();
 * prisma.$seed("afkEntry", [{ userId: "1", guildId: "g", reason: "AFK", since: new Date() }]);
 *
 * const repo = new AfkRepository(prisma as any, mockRedis, mockLogger, mockDb);
 * await repo.findEntry("g", "1"); // reads the seeded row, no real Postgres involved
 * ```
 *
 * Or swap the whole `@prisma/client` module in a test file, the same way
 * `event-bus.test.ts` swaps `ioredis`:
 *
 * ```ts
 * import { vi } from "vitest";
 * import { createMockPrismaClient } from "../mocks/prisma.js";
 *
 * const mockClient = createMockPrismaClient();
 * vi.mock("@prisma/client", () => ({
 *   PrismaClient: vi.fn(() => mockClient),
 * }));
 * ```
 *
 * ### What it deliberately does NOT do
 *
 * - No relation loading (`include`) - it returns the flat record unchanged.
 *   Seed already-joined shapes yourself if a test needs one.
 * - No referential-integrity / cascade-delete enforcement.
 * - `where` filtering supports equality, the common scalar operators
 *   (`equals`, `not`, `in`, `notIn`, `lt(e)`, `gt(e)`, `contains`,
 *   `startsWith`, `endsWith`), `AND`/`OR`/`NOT`, and flattened compound keys
 *   (e.g. `where: { userId_guildId: { userId, guildId } }` for a
 *   `@@id([userId, guildId])` model) - not the full Prisma filter grammar.
 * - `update`'s `data` supports plain field assignment plus the numeric
 *   `{ increment | decrement | multiply | divide | set }` operators.
 *
 * This covers every pattern currently used under `repositories/`; extend
 * `applyOperator`/`matches` below if a new repository needs more.
 */

type Rec = Record<string, unknown>;

/** Yields one microtask - see the comment on MockModelDelegate's methods below. */
function tick(): Promise<void> {
  return Promise.resolve();
}

const OPERATOR_KEYS = new Set([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
  "mode",
]);

function isPlainObject(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function scalarEquals(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as never).getTime() === new Date(b as never).getTime();
  }
  return a === b;
}

/** Evaluates a single Prisma-style field filter (`{ gte: 5 }`, `"x"`, a Date, ...) against a value. */
function matchesFieldFilter(actual: unknown, filter: unknown): boolean {
  if (!isPlainObject(filter) || filter instanceof Date) {
    return scalarEquals(actual, filter);
  }

  const hasOperatorKeys = Object.keys(filter).some((k) => OPERATOR_KEYS.has(k));
  if (!hasOperatorKeys) {
    // Not a filter object - either a nested compound-key shape (handled by the
    // caller before reaching here) or a plain scalar-ish object; fall back to
    // deep equality.
    return JSON.stringify(actual) === JSON.stringify(filter);
  }

  for (const [op, value] of Object.entries(filter)) {
    switch (op) {
      case "equals":
        if (!scalarEquals(actual, value)) return false;
        break;
      case "not":
        if (scalarEquals(actual, value)) return false;
        break;
      case "in":
        if (!Array.isArray(value) || !value.some((v) => scalarEquals(actual, v))) return false;
        break;
      case "notIn":
        if (Array.isArray(value) && value.some((v) => scalarEquals(actual, v))) return false;
        break;
      case "lt":
        if (!(actual !== null && actual !== undefined && (actual as never) < (value as never))) return false;
        break;
      case "lte":
        if (!(actual !== null && actual !== undefined && (actual as never) <= (value as never))) return false;
        break;
      case "gt":
        if (!(actual !== null && actual !== undefined && (actual as never) > (value as never))) return false;
        break;
      case "gte":
        if (!(actual !== null && actual !== undefined && (actual as never) >= (value as never))) return false;
        break;
      case "contains":
        if (typeof actual !== "string" || typeof value !== "string" || !actual.includes(value)) return false;
        break;
      case "startsWith":
        if (typeof actual !== "string" || typeof value !== "string" || !actual.startsWith(value)) return false;
        break;
      case "endsWith":
        if (typeof actual !== "string" || typeof value !== "string" || !actual.endsWith(value)) return false;
        break;
      case "mode":
        break; // case-sensitivity toggle - ignored, matches are already case-sensitive
      default:
        break;
    }
  }
  return true;
}

/** Evaluates a full Prisma `where` clause (including AND/OR/NOT and compound keys) against a record. */
function matches(record: Rec, where: Rec | undefined): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      const clauses = Array.isArray(value) ? value : [value];
      if (!clauses.every((c: Rec) => matches(record, c))) return false;
      continue;
    }
    if (key === "OR") {
      const clauses = Array.isArray(value) ? value : [value];
      if (!clauses.some((c: Rec) => matches(record, c))) return false;
      continue;
    }
    if (key === "NOT") {
      const clauses = Array.isArray(value) ? value : [value];
      if (clauses.some((c: Rec) => matches(record, c))) return false;
      continue;
    }

    if (key in record) {
      if (!matchesFieldFilter(record[key], value)) return false;
      continue;
    }

    // Not a direct field - most likely a flattened compound-unique key, e.g.
    // `userId_guildId: { userId, guildId }` for `@@id([userId, guildId])`.
    // AND its sub-fields against the record directly.
    if (isPlainObject(value)) {
      if (!matches(record, value)) return false;
      continue;
    }

    return false;
  }
  return true;
}

function applyUpdateData(record: Rec, data: Rec): Rec {
  const next = { ...record };
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      const current = Number(next[key] ?? 0);
      if ("increment" in value) next[key] = current + Number(value.increment);
      else if ("decrement" in value) next[key] = current - Number(value.decrement);
      else if ("multiply" in value) next[key] = current * Number(value.multiply);
      else if ("divide" in value) next[key] = current / Number(value.divide);
      else if ("set" in value) next[key] = value.set;
      else next[key] = value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function applyOrderBy(rows: Rec[], orderBy: unknown): Rec[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses as Rec[]) {
      for (const [field, dir] of Object.entries(clause)) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        const cmp = av! > bv! ? 1 : -1;
        return dir === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
}

function applySelect(record: Rec, select: Rec | undefined): Rec {
  if (!select) return record;
  const out: Rec = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (wanted) out[key] = record[key];
  }
  return out;
}

class PrismaNotFoundError extends Error {
  public readonly code = "P2025";
  public constructor(model: string) {
    super(`MockPrismaClient: No ${model} record found for the given where clause.`);
  }
}

/** One in-memory "table" plus the Prisma delegate methods bound to it. */
class MockModelDelegate {
  private rows: Rec[] = [];

  public constructor(private readonly modelName: string) {}

  public $seed(rows: Rec[]): void {
    this.rows = rows.map((r) => ({ ...r }));
  }

  public $all(): Rec[] {
    return this.rows.map((r) => ({ ...r }));
  }

  public $clear(): void {
    this.rows = [];
  }

  // Every delegate method starts with `await tick()` purely to earn its
  // `async` keyword under the no-unawaited-async lint rule - it also happens
  // to be a good thing to keep: it makes this mock behave like a real async
  // client for tests that assert on ordering/interleaving, instead of
  // resolving perfectly synchronously.
  public findUnique = async (args: { where?: Rec; select?: Rec } = {}) => {
    await tick();
    const found = this.rows.find((r) => matches(r, args.where));
    return found ? applySelect({ ...found }, args.select) : null;
  };

  public findFirst = async (args: { where?: Rec; orderBy?: unknown; select?: Rec } = {}) => {
    await tick();
    const matched = applyOrderBy(this.rows.filter((r) => matches(r, args.where)), args.orderBy);
    const found = matched[0];
    return found ? applySelect({ ...found }, args.select) : null;
  };

  public findMany = async (
    args: { where?: Rec; orderBy?: unknown; take?: number; skip?: number; select?: Rec } = {},
  ) => {
    await tick();
    let matched = applyOrderBy(this.rows.filter((r) => matches(r, args.where)), args.orderBy);
    if (args.skip) matched = matched.slice(args.skip);
    if (args.take !== undefined) matched = matched.slice(0, args.take);
    return matched.map((r) => applySelect({ ...r }, args.select));
  };

  public count = async (args: { where?: Rec } = {}) => {
    await tick();
    return this.rows.filter((r) => matches(r, args.where)).length;
  };

  public create = async (args: { data: Rec; select?: Rec }) => {
    await tick();
    const record = { ...args.data };
    this.rows.push(record);
    return applySelect({ ...record }, args.select);
  };

  public createMany = async (args: { data: Rec[] }) => {
    await tick();
    this.rows.push(...args.data.map((d) => ({ ...d })));
    return { count: args.data.length };
  };

  public update = async (args: { where: Rec; data: Rec; select?: Rec }) => {
    await tick();
    const idx = this.rows.findIndex((r) => matches(r, args.where));
    if (idx === -1) throw new PrismaNotFoundError(this.modelName);
    this.rows[idx] = applyUpdateData(this.rows[idx]!, args.data);
    return applySelect({ ...this.rows[idx] }, args.select);
  };

  public updateMany = async (args: { where?: Rec; data: Rec }) => {
    await tick();
    let count = 0;
    this.rows = this.rows.map((r) => {
      if (!matches(r, args.where)) return r;
      count++;
      return applyUpdateData(r, args.data);
    });
    return { count };
  };

  public upsert = async (args: { where: Rec; update: Rec; create: Rec; select?: Rec }) => {
    await tick();
    const idx = this.rows.findIndex((r) => matches(r, args.where));
    if (idx === -1) {
      const record = { ...args.create };
      this.rows.push(record);
      return applySelect({ ...record }, args.select);
    }
    this.rows[idx] = applyUpdateData(this.rows[idx]!, args.update);
    return applySelect({ ...this.rows[idx] }, args.select);
  };

  public delete = async (args: { where: Rec; select?: Rec }) => {
    await tick();
    const idx = this.rows.findIndex((r) => matches(r, args.where));
    if (idx === -1) throw new PrismaNotFoundError(this.modelName);
    const [removed] = this.rows.splice(idx, 1);
    return applySelect({ ...removed! }, args.select);
  };

  public deleteMany = async (args: { where?: Rec } = {}) => {
    await tick();
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, args.where));
    return { count: before - this.rows.length };
  };
}

/**
 * A schema-agnostic in-memory stand-in for `@prisma/client`'s `PrismaClient`.
 * Access any camelCase model delegate (`client.afkEntry`, `client.guild`, ...)
 * and it is created on first touch - nothing needs to be registered up front.
 */
export class MockPrismaClient {
  private readonly delegates = new Map<string, MockModelDelegate>();

  // The proxy-wrapped instance returned by createMockPrismaClient(), if any -
  // set by withModelProxy so $transaction's callback form can hand callers
  // something that still resolves arbitrary model names, not the raw
  // instance (which has no Proxy trap of its own).
  private selfRef: MockPrismaClient | undefined;

  /** @internal used by withModelProxy() to close the self-reference loop. */
  public $setSelfRef(self: MockPrismaClient): void {
    this.selfRef = self;
  }

  /** Returns (lazily creating) the in-memory delegate for a model name. */
  public delegateFor(model: string): MockModelDelegate {
    let delegate = this.delegates.get(model);
    if (!delegate) {
      delegate = new MockModelDelegate(model);
      this.delegates.set(model, delegate);
    }
    return delegate;
  }

  /** Seeds a model's table, replacing any existing rows. */
  public $seed(model: string, rows: Rec[]): void {
    this.delegateFor(model).$seed(rows);
  }

  /** Returns every row currently stored for a model - handy for assertions. */
  public $all(model: string): Rec[] {
    return this.delegateFor(model).$all();
  }

  /** Wipes every model's table. */
  public $reset(): void {
    this.delegates.clear();
  }

  /**
   * `$extends` no-ops and returns `this` - `packages/core/src/lib/prisma/client.ts`
   * calls it once to attach the slow-query diagnostic middleware, which has
   * nothing to observe against an in-memory store.
   */
  public $extends(): this {
    return this;
  }

  public async $connect(): Promise<void> {}
  public async $disconnect(): Promise<void> {}

  /**
   * Supports both transaction forms Prisma offers:
   *   - array form: `$transaction([p1, p2])` - already-created promises, just awaited.
   *   - interactive form: `$transaction(async (tx) => ...)` - `tx` is this same
   *     client (no real isolation, since everything is already in-process and
   *     synchronous-ish).
   */
  public $transaction = (async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === "function") return arg(this.selfRef ?? this);
    throw new TypeError("MockPrismaClient.$transaction: expected an array or a callback.");
  }) as {
    <T>(promises: Promise<T>[]): Promise<T[]>;
    <T>(fn: (tx: MockPrismaClient) => Promise<T>): Promise<T>;
  };

  [model: string]: unknown;
}

// Proxy wraps the class instance so any camelCase property access that isn't
// already a method/field on MockPrismaClient (i.e. a model name) transparently
// resolves to that model's delegate, without pre-declaring all 24 models.
// Property names that must never be treated as a Prisma model, even though
// they aren't declared on MockPrismaClient - guards against thenable-probing
// (`await someMockClient` checking `.then`) and other incidental lookups.
const NON_MODEL_PROPS = new Set(["then", "catch", "finally", "toJSON", "constructor"]);

function withModelProxy(client: MockPrismaClient): MockPrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || NON_MODEL_PROPS.has(prop)) {
        return Reflect.get(target, prop, receiver);
      }
      const existing = Reflect.get(target, prop, receiver);
      if (existing !== undefined) return existing;
      // Any unrecognized string property is treated as a Prisma model name.
      return target.delegateFor(prop);
    },
  });
}

/** Creates a fresh, empty in-memory Prisma client for a single test. */
export function createMockPrismaClient(): MockPrismaClient {
  const client = new MockPrismaClient();
  const proxied = withModelProxy(client);
  client.$setSelfRef(proxied);
  return proxied;
}
