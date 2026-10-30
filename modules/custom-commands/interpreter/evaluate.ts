import type {
  Expression,
  FilterExpression,
  PathExpression,
  TemplateNode,
} from "./ast.js";
import { parseTemplate, TemplateError } from "./parser.js";
import { Limits, type KvAdapter } from "../types.js";

export interface InterpretLimits {
  maxOutputBytes: number;
  maxSteps: number;
  maxKvOps: number;
  maxRangeIterations: number;
  maxDepth: number;
}

export interface InterpretContext {
  values: Record<string, unknown>;
  kv?: KvAdapter;
  limits?: Partial<InterpretLimits>;
}

interface RenderState {
  output: string[];
  outputBytes: number;
  steps: number;
  kvOps: number;
  limits: InterpretLimits;
  encoder: TextEncoder;
}

const ForbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);

const DefaultLimits: InterpretLimits = {
  maxOutputBytes: Limits.renderedOutputBytes,
  maxSteps: Limits.evalSteps,
  maxKvOps: Limits.kvOpsPerRun,
  maxRangeIterations: Limits.rangeIterations,
  maxDepth: Limits.maxDepth,
};

function resolveLimits(overrides?: Partial<InterpretLimits>): InterpretLimits {
  return { ...DefaultLimits, ...overrides };
}

function step(state: RenderState): void {
  state.steps += 1;
  if (state.steps > state.limits.maxSteps) {
    throw new TemplateError(
      "evaluation-limit",
      "Template evaluation exceeded its step limit.",
    );
  }
}

function write(state: RenderState, text: string): void {
  if (text.length === 0) return;
  const bytes = state.encoder.encode(text).byteLength;
  if (state.outputBytes + bytes > state.limits.maxOutputBytes) {
    throw new TemplateError(
      "output-limit",
      `Rendered output exceeds ${state.limits.maxOutputBytes} bytes.`,
    );
  }
  state.output.push(text);
  state.outputBytes += bytes;
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyValue(entry)).join(", ");
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === "") return false;
  if (typeof value === "number" && Number.isNaN(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function compareValues(
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
  left: unknown,
  right: unknown,
): boolean {
  if (operator === "eq" || operator === "neq") {
    let equal: boolean;
    if (typeof left === typeof right) {
      equal = left === right;
    } else if (left === null || left === undefined) {
      equal = right === null || right === undefined;
    } else if (right === null || right === undefined) {
      equal = false;
    } else {
      equal = stringifyValue(left) === stringifyValue(right);
    }
    return operator === "eq" ? equal : !equal;
  }

  const a = toNumber(left);
  const b = toNumber(right);
  if (a !== null && b !== null) {
    if (operator === "gt") return a > b;
    if (operator === "gte") return a >= b;
    if (operator === "lt") return a < b;
    return a <= b;
  }

  const sa = stringifyValue(left);
  const sb = stringifyValue(right);
  if (operator === "gt") return sa > sb;
  if (operator === "gte") return sa >= sb;
  if (operator === "lt") return sa < sb;
  return sa <= sb;
}

function resolvePath(
  expression: PathExpression,
  context: InterpretContext,
  state: RenderState,
): Promise<unknown> {
  return (async () => {
    const root = expression.root;
    if (ForbiddenKeys.has(root)) return undefined;
    let value: unknown = context.values[root];

    for (const segment of expression.segments) {
      step(state);
      let key: string | number;
      if (typeof segment === "string" || typeof segment === "number") {
        key = segment;
      } else {
        const resolved = await evaluateExpression(segment.expression, context, state);
        if (typeof resolved === "number") key = resolved;
        else key = stringifyValue(resolved);
      }

      if (typeof key === "string" && ForbiddenKeys.has(key)) return undefined;
      if (value === null || value === undefined) return undefined;

      if (Array.isArray(value)) {
        if (key === "length") {
          value = value.length;
          continue;
        }
        if (
          typeof key === "string" &&
          Object.hasOwn(value, key)
        ) {
          value = (value as unknown as Record<string, unknown>)[key];
          continue;
        }
        const index = typeof key === "number" ? key : Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= value.length) {
          return undefined;
        }
        value = value[index];
        continue;
      }

      if (typeof value === "string") {
        if (key === "length") {
          value = value.length;
          continue;
        }
        const index = typeof key === "number" ? key : Number(key);
        if (Number.isInteger(index) && index >= 0 && index < value.length) {
          value = value[index];
          continue;
        }
        return undefined;
      }

      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (key === "length") {
          if (Array.isArray(record)) {
            value = record.length;
            continue;
          }
        }
        if (!Object.hasOwn(record, key)) return undefined;
        value = record[key as string];
        continue;
      }

      return undefined;
    }

    return value;
  })();
}

function filterArgument(
  filter: FilterExpression,
  index: number,
  context: InterpretContext,
  state: RenderState,
): Promise<unknown> {
  const expression = filter.args[index];
  if (!expression) return Promise.resolve(undefined);
  return evaluateExpression(expression, context, state);
}

async function applyFilter(
  filter: FilterExpression,
  value: unknown,
  context: InterpretContext,
  state: RenderState,
): Promise<unknown> {
  step(state);
  const args = await Promise.all(
    filter.args.map((_, index) =>
      filterArgument(filter, index, context, state),
    ),
  );
  const text = stringifyValue(value);

  switch (filter.name) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return text.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
    case "trim":
      return text.trim();
    case "reverse":
      return [...text].reverse().join("");
    case "length":
      if (Array.isArray(value)) return value.length;
      if (typeof value === "object" && value !== null) {
        return Object.keys(value as object).length;
      }
      return text.length;
    case "truncate": {
      const limit = Math.max(0, Math.floor(toNumber(args[0]) ?? 100));
      return text.length > limit
        ? `${text.slice(0, Math.max(0, limit - 1))}…`
        : text;
    }
    case "default":
      return isTruthy(value) ? value : (args[0] ?? "");
    case "json":
      return JSON.stringify(value ?? null);
    case "urlencode":
      return encodeURIComponent(text);
    case "number": {
      const number = toNumber(value);
      return number === null ? text : String(number);
    }
    case "ordinal": {
      const number = Math.floor(toNumber(value) ?? 0);
      if (number <= 0) return text;
      const mod100 = number % 100;
      const suffix =
        mod100 >= 11 && mod100 <= 13
          ? "th"
          : number % 10 === 1
            ? "st"
            : number % 10 === 2
              ? "nd"
              : number % 10 === 3
                ? "rd"
                : "th";
      return `${number}${suffix}`;
    }
    case "join": {
      const separator = stringifyValue(args[0] ?? ", ");
      if (Array.isArray(value)) {
        return value.map((entry) => stringifyValue(entry)).join(separator);
      }
      return text;
    }
    case "first":
      return Array.isArray(value) ? value[0] : text.charAt(0);
    case "last":
      return Array.isArray(value) ? value[value.length - 1] : text.slice(-1);
    case "keys":
      return value !== null && typeof value === "object"
        ? Object.keys(value as object)
        : [];
    case "values":
      return value !== null && typeof value === "object"
        ? Object.values(value as object)
        : [];
    case "replace": {
      const search = stringifyValue(args[0] ?? "");
      const replacement = stringifyValue(args[1] ?? "");
      return search.length === 0 ? text : text.split(search).join(replacement);
    }
    case "mention": {
      if (value !== null && typeof value === "object" && "mention" in value) {
        return stringifyValue((value as { mention: unknown }).mention);
      }
      const id = (value as { id?: unknown } | null)?.id;
      return typeof id === "string" ? `<@${id}>` : text;
    }
    case "channelmention": {
      const id = (value as { id?: unknown } | null)?.id;
      return typeof id === "string" ? `<#${id}>` : text;
    }
    case "rolemention": {
      const id = (value as { id?: unknown } | null)?.id;
      return typeof id === "string" ? `<@&${id}>` : text;
    }
    default:
      throw new TemplateError(
        "unknown-filter",
        `Unknown filter "${filter.name}".`,
      );
  }
}

async function evaluateCallExpression(
  expression: { namespace: string; name: string; args: Expression[] },
  context: InterpretContext,
  state: RenderState,
): Promise<unknown> {
  if (expression.namespace !== "kv") {
    throw new TemplateError(
      "unknown-function",
      `Unknown function namespace "${expression.namespace}".`,
    );
  }
  if (!context.kv) {
    throw new TemplateError(
      "kv-unavailable",
      "KV functions are not available in this context.",
    );
  }

  state.kvOps += 1;
  if (state.kvOps > state.limits.maxKvOps) {
    throw new TemplateError(
      "kv-limit",
      `KV operations exceed the ${state.limits.maxKvOps} per-run limit.`,
    );
  }

  const args: unknown[] = [];
  for (const argument of expression.args) {
    args.push(await evaluateExpression(argument, context, state));
  }

  const name = expression.name.toLowerCase();
  const key = stringifyValue(args[0] ?? "");
  if (key.length === 0 || key.length > Limits.keyLength) {
    throw new TemplateError(
      "kv-key",
      `KV keys must be between 1 and ${Limits.keyLength} characters.`,
    );
  }

  if (name === "get") return context.kv.get(key);
  if (name === "set") {
    const ttl = args[2] === undefined ? undefined : toNumber(args[2]) ?? undefined;
    await context.kv.set(key, args[1] ?? null, ttl);
    return "";
  }
  if (name === "incr") {
    return context.kv.incr(key, args[1] === undefined ? 1 : toNumber(args[1]) ?? 1);
  }
  if (name === "del") return context.kv.del(key);

  throw new TemplateError(
    "unknown-function",
    `Unknown KV function "kv.${expression.name}".`,
  );
}

async function evaluateExpression(
  expression: Expression,
  context: InterpretContext,
  state: RenderState,
): Promise<unknown> {
  step(state);

  switch (expression.type) {
    case "literal":
      return expression.value;
    case "path":
      return resolvePath(expression, context, state);
    case "call":
      return evaluateCallExpression(expression, context, state);
    case "filtered": {
      const value = await evaluateExpression(expression.value, context, state);
      let current = value;
      for (const filter of expression.filters) {
        current = await applyFilter(filter, current, context, state);
      }
      return current;
    }
    case "unary": {
      const value = await evaluateExpression(expression.value, context, state);
      if (expression.operator === "not") return !isTruthy(value);
      const number = toNumber(value);
      return number === null ? 0 : -number;
    }
    case "binary": {
      if (expression.operator === "and") {
        const left = await evaluateExpression(expression.left, context, state);
        if (!isTruthy(left)) return false;
        return isTruthy(await evaluateExpression(expression.right, context, state));
      }
      if (expression.operator === "or") {
        const left = await evaluateExpression(expression.left, context, state);
        if (isTruthy(left)) return true;
        return isTruthy(await evaluateExpression(expression.right, context, state));
      }
      const left = await evaluateExpression(expression.left, context, state);
      const right = await evaluateExpression(expression.right, context, state);
      return compareValues(expression.operator, left, right);
    }
  }
}

async function renderNodes(
  nodes: TemplateNode[],
  context: InterpretContext,
  state: RenderState,
  depth: number,
): Promise<void> {
  if (depth > state.limits.maxDepth) {
    throw new TemplateError(
      "depth-limit",
      `Template nesting exceeds ${state.limits.maxDepth}.`,
    );
  }

  for (const node of nodes) {
    step(state);
    if (node.type === "text") {
      write(state, node.value);
      continue;
    }

    if (node.type === "tag") {
      const value = await evaluateExpression(node.expression, context, state);
      write(state, stringifyValue(value));
      continue;
    }

    if (node.type === "if") {
      const value = await evaluateExpression(node.test, context, state);
      await renderNodes(
        isTruthy(value) ? node.truthy : node.falsy,
        context,
        state,
        depth + 1,
      );
      continue;
    }

    const start = toNumber(await evaluateExpression(node.start, context, state));
    const end = toNumber(await evaluateExpression(node.end, context, state));
    const stepValue = toNumber(await evaluateExpression(node.step, context, state));
    if (start === null || end === null || stepValue === null || stepValue === 0) {
      throw new TemplateError(
        "invalid-range",
        "range start, end and step must be numbers and step cannot be zero.",
      );
    }

    const direction = stepValue > 0 ? 1 : -1;
    const matchesDirection =
      (start <= end && direction === 1) || (start >= end && direction === -1);
    if (!matchesDirection) continue;

    const count = Math.floor(Math.abs((end - start) / stepValue)) + 1;
    if (count > state.limits.maxRangeIterations) {
      throw new TemplateError(
        "range-limit",
        `range cannot exceed ${state.limits.maxRangeIterations} iterations.`,
      );
    }

    for (let index = 0, value = start; index < count; index += 1, value += stepValue) {
      step(state);
      const child: InterpretContext = {
        ...context,
        values: {
          ...context.values,
          value,
          index,
          first: index === 0,
          last: index === count - 1,
        },
      };
      await renderNodes(node.body, child, state, depth + 1);
    }
  }
}

export async function renderTemplate(
  template: string,
  context: InterpretContext,
): Promise<string> {
  const nodes = parseTemplate(template);
  const state: RenderState = {
    output: [],
    outputBytes: 0,
    steps: 0,
    kvOps: 0,
    limits: resolveLimits(context.limits),
    encoder: new TextEncoder(),
  };
  await renderNodes(nodes, context, state, 0);
  return state.output.join("");
}

export { TemplateError };
