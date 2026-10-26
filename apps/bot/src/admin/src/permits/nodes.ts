import type { Polarity } from "@lumi/permits";
import type { ModuleLoader } from "@lumi/module-runtime";

const BuiltinNodes = [
  "*",
  "admin.*",
  "admin.config",
  "mod.*",
  "mod.ban",
  "mod.unban",
  "mod.kick",
  "mod.timeout",
  "mod.warn",
  "mod.note",
  "mod.case",
  "mod.lock",
  "mod.lockdown",
  "mod.quarantine",
  "mod.vcmute",
  "mod.nick",
  "utility.*",
  "utility.purge",
  "economy.*",
  "economy.admin",
  "leveling.*",
  "logging.*",
  "logging.claim",
  "owner.*",
  "reactionroles.*",
  "reactionroles.manage",
  "tempvc.*",
  "tempvc.admin",
];

export const GlobalPermitNamespace = "global";

const NodePattern = /^(\*|[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*(\.\*)?)$/;

export function isValidNode(node: string): boolean {
  return node.length <= 100 && NodePattern.test(node);
}

export function namespaceForNode(node: string): string {
  if (node === "*") return GlobalPermitNamespace;
  const index = node.indexOf(".");
  return index === -1 ? node : node.slice(0, index);
}

export function collectPermitNodes(
  moduleLoader: ModuleLoader,
  extra: string[],
): string[] {
  const nodes = new Set<string>(BuiltinNodes);
  for (const module of moduleLoader.listAll()) {
    for (const command of module.definition.commands ?? []) {
      const node = command.requiredPermit;
      if (node === undefined) continue;
      if (node.length === 0) continue;
      nodes.add(node);
      const namespace = namespaceForNode(node);
      if (namespace !== node && namespace !== GlobalPermitNamespace) {
        nodes.add(`${namespace}.*`);
      }
    }
  }
  for (const node of extra) {
    if (node.length > 0) nodes.add(node);
  }
  return Array.from(nodes).sort((left, right) => {
    if (left === "*") return -1;
    if (right === "*") return 1;
    return left.localeCompare(right);
  });
}

export function permitNamespaces(nodes: string[]): string[] {
  return Array.from(new Set(nodes.map(namespaceForNode))).sort((left, right) => {
    if (left === GlobalPermitNamespace) return -1;
    if (right === GlobalPermitNamespace) return 1;
    return left.localeCompare(right);
  });
}

export function nodesInNamespace(nodes: string[], namespace: string): string[] {
  if (namespace === GlobalPermitNamespace) {
    return nodes.filter((node) => node === "*");
  }
  return nodes.filter((node) => namespaceForNode(node) === namespace);
}

export function namespaceLabel(namespace: string): string {
  if (namespace === GlobalPermitNamespace) return "Global";
  return namespace.charAt(0).toUpperCase() + namespace.slice(1);
}

export function nodeDescription(node: string): string {
  if (node === "*") return "All permission nodes";
  if (node.endsWith(".*")) return "Wildcard for this namespace";
  return "Exact permission node";
}

export function readablePermitName(node: string, polarity: Polarity): string {
  const readable = node
    .replace(/\./g, " ")
    .replace(/\*/g, "all")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return `${polarity} ${readable}`.slice(0, 64);
}

export function parseNodeList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((node) => node.trim())
        .filter((node) => node.length > 0),
    ),
  );
}

export function formatPermitNodes(
  nodes: readonly string[],
  limit = 3,
): string {
  if (nodes.length === 0) return "*no nodes*";
  const shown = nodes
    .slice(0, limit)
    .map((node) => `\`${node}\``)
    .join(" ");
  const remaining = nodes.length - limit;
  return remaining > 0 ? `${shown} +${remaining}` : shown;
}

export function formatPermitNodeLines(
  nodes: readonly string[],
  limit = nodes.length,
): string {
  if (nodes.length === 0) return "*no nodes*";
  const shown = nodes
    .slice(0, limit)
    .map((node) => `\`${node}\``)
    .join("\n");
  const remaining = nodes.length - limit;
  return remaining > 0 ? `${shown}\n-# ...and ${remaining} more` : shown;
}

export function suggestPermitName(
  nodes: readonly string[],
  polarity: Polarity,
): string {
  if (nodes.length === 0) return "";
  if (nodes.length === 1) return readablePermitName(nodes[0]!, polarity);
  const base = readablePermitName(nodes[0]!, polarity).slice(0, 56);
  return `${base} +${nodes.length - 1}`.slice(0, 64);
}
