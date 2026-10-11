

type Rec = Record<string, unknown>;

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
  "has",
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

function matchesFieldFilter(actual: unknown, filter: unknown): boolean {
  if (!isPlainObject(filter) || filter instanceof Date) {
    return scalarEquals(actual, filter);
  }

  const hasOperatorKeys = Object.keys(filter).some((k) => OPERATOR_KEYS.has(k));
  if (!hasOperatorKeys) {

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
        break;
      case "has":
        if (!Array.isArray(actual) || !actual.some((v) => scalarEquals(v, value))) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

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

function toComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function applyOrderBy(rows: Rec[], orderBy: unknown): Rec[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses as Rec[]) {
      for (const [field, dir] of Object.entries(clause)) {
        const av = toComparable(a[field]);
        const bv = toComparable(b[field]);
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

export class MockModelDelegate {
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

  public aggregate = async (args: { _sum?: Rec; where?: Rec } = {}) => {
    await tick();
    const matched = this.rows.filter((r) => matches(r, args.where));
    const out: Rec = { _sum: {} };
    if (args._sum) {
      const sums = out._sum as Rec;
      for (const field of Object.keys(args._sum)) {
        let total: number | null = null;
        for (const row of matched) {
          const v = row[field];
          if (typeof v === "number") total = (total ?? 0) + v;
        }
        sums[field] = total;
      }
    }
    return out;
  };

  public create = async (args: { data: Rec; select?: Rec }) => {
    await tick();
    const id =
      (args.data as any)?.id ??
      (this.modelName.toLowerCase().includes("permit")
        ? this.rows.length + 1
        : `mock-${Math.random().toString(36).slice(2, 9)}`);
    const record = { id, ...args.data };
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
      const id =
        (args.create as any)?.id ??
        (this.modelName.toLowerCase().includes("permit")
          ? this.rows.length + 1
          : `mock-${Math.random().toString(36).slice(2, 9)}`);
      const record = { id, ...args.create };
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

export class MockPrismaClient {
  private readonly delegates = new Map<string, MockModelDelegate>();

  private selfRef: MockPrismaClient | undefined;

  public $setSelfRef(self: MockPrismaClient): void {
    this.selfRef = self;
  }

  public delegateFor(model: string): MockModelDelegate {
    let delegate = this.delegates.get(model);
    if (!delegate) {
      delegate = new MockModelDelegate(model);
      this.delegates.set(model, delegate);
    }
    return delegate;
  }

  public $seed(model: string, rows: Rec[]): void {
    this.delegateFor(model).$seed(rows);
  }

  public $all(model: string): Rec[] {
    return this.delegateFor(model).$all();
  }

  public $reset(): void {
    this.delegates.clear();
  }

  public $extends(): this {
    return this;
  }

  public async $connect(): Promise<void> {}
  public async $disconnect(): Promise<void> {}

  public $transaction = (async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === "function") return arg(this.selfRef ?? this);
    throw new TypeError("MockPrismaClient.$transaction: expected an array or a callback.");
  }) as {
    <T extends readonly unknown[] | []>(
      promises: readonly [...{ [K in keyof T]: Promise<T[K]> }],
    ): Promise<T>;
    <T>(fn: (tx: MockPrismaClient) => Promise<T>): Promise<T>;
  };

  public $queryRaw = async (query: unknown): Promise<Rec[]> => {
    await tick();
    const like = query as { strings?: string[]; values?: unknown[] };
    const sql = Array.isArray(like?.strings) ? like.strings.join("?") : String(query);
    const values = Array.isArray(like?.values) ? like.values : [];
    const accounts = this.delegateFor("economyAccount")
      .$all()
      .filter((r) => r["guildId"] === values[0]);
    const withTotal = accounts.map((r) => ({
      userId: r["userId"] as string,
      wallet: Number(r["wallet"] ?? 0),
      bank: Number(r["bank"] ?? 0),
      total: Number(r["wallet"] ?? 0) + Number(r["bank"] ?? 0),
    }));
    withTotal.sort((a, b) => b.total - a.total || (a.userId < b.userId ? -1 : 1));
    if (sql.includes("RANK() OVER")) {
      const limit = Number(values[1] ?? 10);
      const offset = Number(values[2] ?? 0);
      const page = withTotal.slice(offset, offset + limit);
      return page.map((e, i) => ({
        userId: e.userId,
        wallet: e.wallet,
        bank: e.bank,
        total: e.total,
        rank: offset + i + 1,
        fullCount: withTotal.length,
      }));
    }
    if (sql.includes("WITH mine AS")) {
      const userId = values[1] as string;
      const mine = withTotal.find((e) => e.userId === userId);
      if (!mine) return [{ rank: 1, exists: false }];
      const rank =
        withTotal.filter(
          (e) => e.total > mine.total || (e.total === mine.total && e.userId < userId),
        ).length + 1;
      return [{ rank, exists: true }];
    }
    throw new Error("MockPrismaClient.$queryRaw: unsupported query.");
  };

  [model: string]: unknown;
}

const NON_MODEL_PROPS = new Set(["then", "catch", "finally", "toJSON", "constructor"]);

function withModelProxy(client: MockPrismaClient): MockPrismaClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || NON_MODEL_PROPS.has(prop)) {
        return Reflect.get(target, prop, receiver);
      }
      const existing = Reflect.get(target, prop, receiver);
      if (existing !== undefined) return existing;

      return target.delegateFor(prop);
    },
  });
}

export function createMockPrismaClient(): MockPrismaClient {
  const client = new MockPrismaClient();
  const proxied = withModelProxy(client);
  client.$setSelfRef(proxied);
  return proxied;
}
