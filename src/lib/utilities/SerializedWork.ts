import { AsyncQueue } from "@sapphire/async-queue";

const queues = new Map<string, AsyncQueue>();

function queueFor(key: string): AsyncQueue {
  let queue = queues.get(key);
  if (!queue) queues.set(key, (queue = new AsyncQueue()));
  return queue;
}

export async function withSerializedWork<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const queue = queueFor(key);
  await queue.wait();
  try {
    return await fn();
  } finally {
    queue.shift();
    if (queue.remaining === 0) queues.delete(key);
  }
}
