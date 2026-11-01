import type {
  BinaryExpression,
  CallExpression,
  Expression,
  FilterExpression,
  PathExpression,
  TemplateNode,
} from "./ast.js";
import { Limits } from "../types.js";

export class TemplateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

type TokenKind =
  "number" | "string" | "identifier" | "operator" | "punct" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  position: number;
}

const TwoCharacterOperators = new Set(["==", "!=", ">=", "<=", "&&", "||"]);

const KnownFilters = new Set([
  "upper",
  "lower",
  "title",
  "trim",
  "reverse",
  "length",
  "truncate",
  "default",
  "json",
  "urlencode",
  "number",
  "ordinal",
  "join",
  "first",
  "last",
  "keys",
  "values",
  "replace",
  "mention",
  "channelmention",
  "rolemention",
]);

const KnownKvFunctions = new Set(["get", "set", "incr", "del"]);

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_$]/.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_$]/.test(character);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index]!;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const start = index;

    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      let value = "";
      let closed = false;
      while (index < input.length) {
        const current = input[index]!;
        if (current === "\\") {
          const next = input[index + 1];
          if (next === undefined) break;
          const escapes: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            "\\": "\\",
            '"': '"',
            "'": "'",
          };
          value += escapes[next] ?? next;
          index += 2;
          continue;
        }
        if (current === quote) {
          index += 1;
          closed = true;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed) {
        throw new TemplateError(
          "unterminated-string",
          "Unterminated string literal.",
        );
      }
      tokens.push({ kind: "string", value, position: start });
      continue;
    }

    if (/[0-9]/.test(character)) {
      index += 1;
      while (index < input.length && /[0-9]/.test(input[index]!)) index += 1;
      if (input[index] === "." && /[0-9]/.test(input[index + 1] ?? "")) {
        index += 1;
        while (index < input.length && /[0-9]/.test(input[index]!)) index += 1;
      }
      tokens.push({
        kind: "number",
        value: input.slice(start, index),
        position: start,
      });
      continue;
    }

    if (isIdentifierStart(character)) {
      index += 1;
      while (index < input.length && isIdentifierPart(input[index]!)) {
        index += 1;
      }
      tokens.push({
        kind: "identifier",
        value: input.slice(start, index),
        position: start,
      });
      continue;
    }

    const pair = input.slice(index, index + 2);
    if (TwoCharacterOperators.has(pair)) {
      index += 2;
      tokens.push({ kind: "operator", value: pair, position: start });
      continue;
    }

    if ("><=!|&".includes(character)) {
      index += 1;
      tokens.push({ kind: "operator", value: character, position: start });
      continue;
    }

    if ("().,[]:".includes(character)) {
      index += 1;
      tokens.push({ kind: "punct", value: character, position: start });
      continue;
    }

    throw new TemplateError(
      "unexpected-character",
      `Unexpected character "${character}" at position ${start}.`,
    );
  }

  tokens.push({ kind: "eof", value: "", position: input.length });
  return tokens;
}

class ExpressionParser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
  }

  private consume(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private match(value: string): boolean {
    const token = this.peek();
    if (token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private expect(value: string): void {
    if (!this.match(value)) {
      const token = this.peek();
      throw new TemplateError(
        "unexpected-token",
        `Expected "${value}" but found "${token.value || "end of expression"}".`,
      );
    }
  }

  private expectIdentifier(): string {
    const token = this.peek();
    if (token.kind !== "identifier") {
      throw new TemplateError(
        "expected-identifier",
        `Expected an identifier but found "${token.value || "end of expression"}".`,
      );
    }
    this.index += 1;
    return token.value;
  }

  parseValueExpression(): Expression {
    const expression = this.parseOr();
    return this.parseFilters(expression);
  }

  parseExpressionList(): Expression[] {
    const expressions: Expression[] = [];
    while (this.peek().kind !== "eof") {
      expressions.push(this.parseOr());
    }
    return expressions;
  }

  parseSingle(): Expression {
    const expression = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw new TemplateError(
        "trailing-tokens",
        `Unexpected token "${this.peek().value}" in expression.`,
      );
    }
    return expression;
  }

  private parseFilters(value: Expression): Expression {
    const filters: FilterExpression[] = [];
    while (this.peek().kind === "operator" && this.peek().value === "|") {
      this.consume();
      const name = this.expectIdentifier();
      if (!KnownFilters.has(name.toLowerCase())) {
        throw new TemplateError("unknown-filter", `Unknown filter "${name}".`);
      }
      const args: Expression[] = [];
      if (this.match(":")) {
        do {
          args.push(this.parseOr());
        } while (this.match(","));
      }
      filters.push({ name: name.toLowerCase(), args });
    }
    if (filters.length === 0) return value;
    return { type: "filtered", value, filters };
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (true) {
      const token = this.peek();
      if (
        (token.kind === "operator" && token.value === "||") ||
        (token.kind === "identifier" && token.value === "or")
      ) {
        this.consume();
        const right = this.parseAnd();
        left = { type: "binary", operator: "or", left, right };
        continue;
      }
      return left;
    }
  }

  private parseAnd(): Expression {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (
        (token.kind === "operator" && token.value === "&&") ||
        (token.kind === "identifier" && token.value === "and")
      ) {
        this.consume();
        const right = this.parseUnary();
        left = { type: "binary", operator: "and", left, right };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): Expression {
    const token = this.peek();
    if (
      (token.kind === "operator" && token.value === "!") ||
      (token.kind === "identifier" && token.value === "not")
    ) {
      this.consume();
      return { type: "unary", operator: "not", value: this.parseUnary() };
    }
    if (token.kind === "operator" && token.value === "-") {
      this.consume();
      return { type: "unary", operator: "negate", value: this.parseUnary() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    const left = this.parsePrimary();
    const token = this.peek();
    const operators: Record<string, BinaryExpression["operator"]> = {
      "==": "eq",
      "!=": "neq",
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte",
    };
    const operator =
      token.kind === "operator" ? operators[token.value] : undefined;
    if (!operator) return left;
    this.consume();
    const right = this.parsePrimary();
    return { type: "binary", operator, left, right };
  }

  private parsePrimary(): Expression {
    const token = this.peek();

    if (token.kind === "number") {
      this.consume();
      return { type: "literal", value: Number(token.value) };
    }

    if (token.kind === "string") {
      this.consume();
      return { type: "literal", value: token.value };
    }

    if (token.value === "(") {
      this.consume();
      const expression = this.parseOr();
      this.expect(")");
      return expression;
    }

    if (token.kind !== "identifier") {
      throw new TemplateError(
        "expected-expression",
        `Expected a value but found "${token.value || "end of expression"}".`,
      );
    }

    const isCall =
      this.peek(1).value === "." &&
      this.peek(2).kind === "identifier" &&
      this.peek(3).value === "(";

    if (isCall) {
      const namespace = this.expectIdentifier();
      this.expect(".");
      const name = this.expectIdentifier();
      if (namespace !== "kv" || !KnownKvFunctions.has(name.toLowerCase())) {
        throw new TemplateError(
          "unknown-function",
          `Unknown function "${namespace}.${name}".`,
        );
      }
      this.expect("(");
      const args: Expression[] = [];
      if (!this.match(")")) {
        do {
          args.push(this.parseOr());
        } while (this.match(","));
        this.expect(")");
      }
      const call: CallExpression = { type: "call", namespace, name, args };
      return call;
    }

    if (token.value === "true" || token.value === "false") {
      this.consume();
      return { type: "literal", value: token.value === "true" };
    }
    if (token.value === "null") {
      this.consume();
      return { type: "literal", value: null };
    }

    const root = this.expectIdentifier();
    const segments: PathExpression["segments"] = [];
    while (true) {
      if (this.match(".")) {
        const segment = this.peek();
        if (segment.kind === "identifier") {
          this.consume();
          segments.push(segment.value);
          continue;
        }
        if (segment.kind === "number") {
          this.consume();
          segments.push(Number(segment.value));
          continue;
        }
        throw new TemplateError(
          "invalid-path",
          "A path segment after . must be a name or number.",
        );
      }
      if (this.match("[")) {
        const expression = this.parseOr();
        this.expect("]");
        segments.push({ expression });
        continue;
      }
      break;
    }

    return { type: "path", root, segments };
  }
}

export function parseExpression(input: string): Expression {
  return new ExpressionParser(input).parseSingle();
}

export function parseValueExpression(input: string): Expression {
  return new ExpressionParser(input).parseValueExpression();
}

export function parseExpressionList(input: string): Expression[] {
  return new ExpressionParser(input).parseExpressionList();
}

interface SectionFrame {
  kind: "if" | "unless" | "range";
  node: TemplateNode & { type: "if" | "range" };
  body: TemplateNode[];
  inElse: boolean;
}

function countNode(state: { count: number }): void {
  state.count += 1;
  if (state.count > Limits.templateNodes) {
    throw new TemplateError(
      "template-too-complex",
      `Template exceeds ${Limits.templateNodes} nodes.`,
    );
  }
}

function sectionNode(
  kind: "if" | "unless" | "range",
  body: string,
): TemplateNode & { type: "if" | "range" } {
  if (kind === "range") {
    const expressions = parseExpressionList(body);
    if (expressions.length < 2 || expressions.length > 3) {
      throw new TemplateError(
        "invalid-range",
        "range expects start, end and an optional step.",
      );
    }
    return {
      type: "range",
      start: expressions[0]!,
      end: expressions[1]!,
      step: expressions[2] ?? { type: "literal", value: 1 },
      body: [],
    };
  }

  const test = parseValueExpression(body);
  const node = {
    type: "if" as const,
    test,
    truthy: [],
    falsy: [],
  };
  if (kind === "unless") {
    return {
      type: "if",
      test: { type: "unary", operator: "not", value: test },
      truthy: [],
      falsy: [],
    };
  }
  return node;
}

export function parseTemplate(template: string): TemplateNode[] {
  if (template.length > Limits.templateLength) {
    throw new TemplateError(
      "template-too-long",
      `Template exceeds ${Limits.templateLength} characters.`,
    );
  }

  const root: TemplateNode[] = [];
  const frames: SectionFrame[] = [];
  const state = { count: 0 };
  let position = 0;

  const currentBody = (): TemplateNode[] => {
    const frame = frames[frames.length - 1];
    if (!frame) return root;
    if (!frame.inElse) return frame.body;
    return frame.node.type === "if" ? frame.node.falsy : frame.body;
  };

  while (position < template.length) {
    const open = template.indexOf("{{", position);
    if (open === -1) {
      const text = template.slice(position);
      if (text.length > 0) {
        countNode(state);
        currentBody().push({ type: "text", value: text });
      }
      break;
    }

    if (open > position) {
      const text = template.slice(position, open);
      countNode(state);
      currentBody().push({ type: "text", value: text });
    }

    const close = template.indexOf("}}", open + 2);
    if (close === -1) {
      throw new TemplateError(
        "unterminated-tag",
        "A {{ tag is missing its closing }}.",
      );
    }

    const raw = template.slice(open + 2, close).trim();
    position = close + 2;

    if (raw.length === 0 || raw.startsWith("!")) continue;

    if (raw.startsWith("#")) {
      const match = /^#\s*([A-Za-z]+)\s*([\s\S]*)$/.exec(raw);
      if (!match) {
        throw new TemplateError(
          "invalid-section",
          `Invalid section tag {{${raw}}}.`,
        );
      }
      const kind = match[1]!.toLowerCase();
      if (kind !== "if" && kind !== "unless" && kind !== "range") {
        throw new TemplateError(
          "unknown-section",
          `Unknown section "${kind}".`,
        );
      }
      const node = sectionNode(kind, match[2] ?? "");
      countNode(state);
      currentBody().push(node);
      frames.push({
        kind,
        node,
        body:
          node.type === "if"
            ? node.truthy
            : node.type === "range"
              ? node.body
              : [],
        inElse: false,
      });
      continue;
    }

    if (raw.startsWith("/")) {
      const match = /^\/\s*([A-Za-z]+)\s*$/.exec(raw);
      if (!match) {
        throw new TemplateError(
          "invalid-close",
          `Invalid closing tag {{${raw}}}.`,
        );
      }
      const name = match[1]!.toLowerCase();
      const frame = frames.pop();
      if (!frame) {
        throw new TemplateError(
          "unexpected-close",
          `Closing tag {{/${name}}} has no open section.`,
        );
      }
      if (frame.kind !== name) {
        throw new TemplateError(
          "mismatched-close",
          `Closing tag {{/${name}}} does not match {{#${frame.kind}}}.`,
        );
      }
      continue;
    }

    if (raw === "else") {
      const frame = frames[frames.length - 1];
      if (!frame || (frame.kind !== "if" && frame.kind !== "unless")) {
        throw new TemplateError(
          "unexpected-else",
          "{{else}} is only valid inside an if or unless block.",
        );
      }
      if (frame.inElse) {
        throw new TemplateError(
          "duplicate-else",
          "A section can only have one else.",
        );
      }
      frame.inElse = true;
      continue;
    }

    const expression = parseValueExpression(raw);
    countNode(state);
    currentBody().push({ type: "tag", expression });
  }

  if (frames.length > 0) {
    throw new TemplateError(
      "unclosed-section",
      `Unclosed {{#${frames[frames.length - 1]!.kind}}} section.`,
    );
  }

  return root;
}

export interface TemplateValidation {
  ok: boolean;
  error?: string;
  code?: string;
}

export function validateTemplate(template: string): TemplateValidation {
  try {
    parseTemplate(template);
    return { ok: true };
  } catch (error) {
    if (error instanceof TemplateError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid template.",
    };
  }
}
