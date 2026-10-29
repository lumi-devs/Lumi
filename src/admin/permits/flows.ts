import type { PermitTargetType, Polarity } from "@lumi/permits";

export type CreateFlow = {
  kind: "create";
  namespace: string;
  nodes: string[];
  polarity: Polarity;
  name: string | undefined;
};

export type ExplainFlow = {
  kind: "explain";
  userId: string | undefined;
};

export type AssignFlow = {
  kind: "assign";
  permitId: number;
  targetType: PermitTargetType;
  targetId: string | undefined;
};

export type PermitFlow = CreateFlow | ExplainFlow | AssignFlow;

interface StoredFlow {
  flow: PermitFlow;
  updatedAt: number;
}

const FlowTtlMs = 30 * 60 * 1000;
const MaxFlows = 5_000;
const flows = new Map<string, StoredFlow>();

export function permitFlowKey(messageId: string, userId: string): string {
  return `${messageId}:${userId}`;
}

function pruneFlows(now: number): void {
  for (const [key, stored] of flows) {
    if (now - stored.updatedAt > FlowTtlMs) flows.delete(key);
  }
  while (flows.size >= MaxFlows) {
    const oldest = flows.keys().next().value;
    if (oldest === undefined) break;
    flows.delete(oldest);
  }
}

export function setPermitFlow(key: string, flow: PermitFlow): void {
  const now = Date.now();
  pruneFlows(now);
  flows.set(key, { flow, updatedAt: now });
}

export function getPermitFlow(key: string): PermitFlow | undefined {
  const stored = flows.get(key);
  if (stored === undefined) return undefined;
  if (Date.now() - stored.updatedAt > FlowTtlMs) {
    flows.delete(key);
    return undefined;
  }
  return stored.flow;
}

export function clearPermitFlow(key: string): void {
  flows.delete(key);
}
