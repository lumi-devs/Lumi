import Valkey, { Cluster, type ChainableCommander } from "iovalkey";
import calculateSlot from "cluster-key-slot";

export type ValkeyClient = Valkey | Cluster;

export function isCluster(client: ValkeyClient): client is Cluster {
  return client instanceof Cluster;
}

function groupBySlot(keys: readonly string[]): Map<number, string[]> {
  const groups = new Map<number, string[]>();
  for (const key of keys) {
    const slot = calculateSlot(key);
    const bucket = groups.get(slot);
    if (bucket) bucket.push(key);
    else groups.set(slot, [key]);
  }
  return groups;
}

export async function mgetSafe(
  client: ValkeyClient,
  keys: readonly string[],
): Promise<(string | null)[]> {
  if (keys.length === 0) return [];
  if (!isCluster(client)) return client.mget(...keys);

  const byKey = new Map<string, string | null>();
  await Promise.all(
    [...groupBySlot(keys).values()].map(async (group) => {
      const values = await client.mget(...group);
      group.forEach((key, i) => byKey.set(key, values[i] ?? null));
    }),
  );

  return keys.map((key) => byKey.get(key) ?? null);
}

export async function scanKeysSafe(
  client: ValkeyClient,
  pattern: string,
  count = 100,
): Promise<string[]> {
  const scanNode = async (node: Valkey): Promise<string[]> => {
    const found: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await node.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        count,
      );
      cursor = next;
      found.push(...keys);
    } while (cursor !== "0");
    return found;
  };

  if (!isCluster(client)) return scanNode(client);

  const perNode = await Promise.all(client.nodes("master").map(scanNode));
  return perNode.flat();
}

export async function pipelineBySlot<T>(
  client: ValkeyClient,
  items: readonly T[],
  keyOf: (item: T) => string,
  apply: (pipe: ChainableCommander, item: T) => void,
): Promise<void> {
  if (items.length === 0) return;

  if (!isCluster(client)) {
    const pipe = client.pipeline();
    for (const item of items) apply(pipe, item);
    assertExecResults(await pipe.exec());
    return;
  }

  const groups = new Map<number, T[]>();
  for (const item of items) {
    const slot = calculateSlot(keyOf(item));
    const bucket = groups.get(slot);
    if (bucket) bucket.push(item);
    else groups.set(slot, [item]);
  }

  await Promise.all(
    [...groups.values()].map(async (group) => {
      const pipe = client.pipeline();
      for (const item of group) apply(pipe, item);
      assertExecResults(await pipe.exec());
    }),
  );
}

function assertExecResults(results: unknown): void {
  if (results === null) throw new Error("Valkey pipeline was discarded");
  if (!Array.isArray(results)) return;
  const failure = results.find(
    (entry) => Array.isArray(entry) && entry[0] != null,
  ) as [unknown] | undefined;
  if (failure) throw failure[0];
}

export async function delSafe(
  client: ValkeyClient,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  if (!isCluster(client)) {
    await client.del(...keys);
    return;
  }
  await Promise.all(
    [...groupBySlot(keys).values()].map((group) => client.del(...group)),
  );
}
