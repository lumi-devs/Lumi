export interface BuiltinPermitDefinition {
  readonly name: string;
  readonly number: number;
  readonly position: number;
  readonly nodes: readonly string[];
  readonly whitelistScopes: readonly string[];
}

export const MinCustomPermitNumber = 3;

export const BuiltinPermits: readonly BuiltinPermitDefinition[] = [
  {
    name: "Extra Owner",
    number: 1,
    position: 1,
    nodes: ["*"],
    whitelistScopes: [
      "security.total",
      "security.antinuke",
      "security.automod",
    ],
  },
  {
    name: "Trusted Admin",
    number: 2,
    position: 2,
    nodes: ["admin.*"],
    whitelistScopes: [
      "security.total",
      "security.antinuke",
      "security.automod",
    ],
  },
];

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
