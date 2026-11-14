export interface LiteralExpression {
  type: "literal";
  value: string | number | boolean | null;
}

export interface PathExpression {
  type: "path";
  root: string;
  segments: Array<string | number | { expression: Expression }>;
}

export interface CallExpression {
  type: "call";
  namespace: string;
  name: string;
  args: Expression[];
}

export interface FilterExpression {
  name: string;
  args: Expression[];
}

export interface FilteredExpression {
  type: "filtered";
  value: Expression;
  filters: FilterExpression[];
}

export interface UnaryExpression {
  type: "unary";
  operator: "not" | "negate";
  value: Expression;
}

export interface BinaryExpression {
  type: "binary";
  operator: "or" | "and" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  left: Expression;
  right: Expression;
}

export type Expression =
  | LiteralExpression
  | PathExpression
  | CallExpression
  | FilteredExpression
  | UnaryExpression
  | BinaryExpression;

export interface TextNode {
  type: "text";
  value: string;
}

export interface TagNode {
  type: "tag";
  expression: Expression;
}

export interface IfNode {
  type: "if";
  test: Expression;
  truthy: TemplateNode[];
  falsy: TemplateNode[];
}

export interface RangeNode {
  type: "range";
  start: Expression;
  end: Expression;
  step: Expression;
  body: TemplateNode[];
}

export type TemplateNode = TextNode | TagNode | IfNode | RangeNode;
