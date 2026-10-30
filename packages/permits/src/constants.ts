export interface BuiltinPermitDefinition {
  readonly name: string;
  readonly number: number;
  readonly position: number;
  readonly nodes: readonly string[];
  readonly whitelistScopes: readonly string[];
}

export const MinCustomPermitNumber = 6;

export const BuiltinPermits: readonly BuiltinPermitDefinition[] = [
  {
    name: "Regular",
    number: 1,
    position: 1,
    nodes: ["utility.*"],
    whitelistScopes: [],
  },
  {
    name: "Trusted Admin",
    number: 4,
    position: 4,
    nodes: ["admin.*"],
    whitelistScopes: [
      "security.total",
      "security.antinuke",
      "security.automod",
    ],
  },
  {
    name: "Extra Owner",
    number: 5,
    position: 5,
    nodes: ["*"],
    whitelistScopes: [
      "security.total",
      "security.antinuke",
      "security.automod",
    ],
  },
];

export const BuiltinPermitNames = BuiltinPermits.map((permit) => permit.name);

export const BuiltinPermitByName = new Map(
  BuiltinPermits.map((permit) => [permit.name, permit]),
);

export const BuiltinPermitByNumber = new Map(
  BuiltinPermits.map((permit) => [permit.number, permit]),
);

export const ReservedPermitNumbers = new Set(
  BuiltinPermits.map((permit) => permit.number),
);

export const BuiltinAssignmentTargetTypes = ["USER"] as const;

export const WhitelistScopes = [
  "security.total",
  "security.antinuke",
  "security.automod",
] as const;

export type WhitelistScope = (typeof WhitelistScopes)[number];

export function isWhitelistScope(value: string): value is WhitelistScope {
  return (WhitelistScopes as readonly string[]).includes(value);
}

export function whitelistScopeLabel(scope: string): string {
  switch (scope) {
    case "security.total":
      return "All security systems";
    case "security.antinuke":
      return "Anti-nuke";
    case "security.automod":
      return "Automod";
    default:
      return scope;
  }
}

export function isImmunePermit(permit: {
  readonly builtin: boolean;
  readonly number: number;
}): boolean {
  return permit.builtin && (permit.number === 4 || permit.number === 5);
}

export function matchesWhitelistScope(
  grantedScope: string,
  requiredScope: string,
): boolean {
  if (grantedScope === requiredScope) return true;
  if (grantedScope === "security.total") {
    return (
      requiredScope === "security.total" ||
      requiredScope.startsWith("security.") ||
      requiredScope === "automod" ||
      requiredScope.startsWith("automod.")
    );
  }
  return false;
}
