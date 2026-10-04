import { randomUUID } from "node:crypto";
import type { LumiDomainEvent, OutboxMessage } from "@lumi/contracts";

export interface OutboxStorage {
  insert(message: OutboxMessage): Promise<void>;
  fetchUnpublished(limit?: number): Promise<OutboxMessage[]>;
  markPublished(ids: string[]): Promise<void>;
}

export class MemoryOutboxStorage implements OutboxStorage {
  readonly #messages: OutboxMessage[] = [];

  public insert(message: OutboxMessage): Promise<void> {
    this.#messages.push(message);
    return Promise.resolve();
  }

  public fetchUnpublished(limit = 100): Promise<OutboxMessage[]> {
    return Promise.resolve(this.#messages.filter((m) => !m.published).slice(0, limit));
  }

  public markPublished(ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    const now = new Date();
    for (const m of this.#messages) {
      if (idSet.has(m.id)) {
        m.published = true;
        m.publishedAt = now;
      }
    }
    return Promise.resolve();
  }
}

export class OutboxService {
  readonly #storage: OutboxStorage;

  public constructor(storage: OutboxStorage = new MemoryOutboxStorage()) {
    this.#storage = storage;
  }

  public createOutboxMessage<T>(event: LumiDomainEvent): OutboxMessage<T> {
    return {
      id: randomUUID(),
      eventId: event.eventId,
      eventType: event.type,
      tenantId: event.tenantId,
      payload: event.payload as T,
      published: false,
      createdAt: new Date(),
    };
  }

  public async record(event: LumiDomainEvent): Promise<OutboxMessage> {
    const msg = this.createOutboxMessage(event);
    await this.#storage.insert(msg);
    return msg;
  }

  public async dispatchPending(
    publisher: (event: OutboxMessage) => Promise<void>,
    batchSize = 50,
  ): Promise<number> {
    const pending = await this.#storage.fetchUnpublished(batchSize);
    if (pending.length === 0) return 0;

    const publishedIds: string[] = [];
    for (const item of pending) {
      try {
        await publisher(item);
        publishedIds.push(item.id);
      } catch {
        // Individual failure preserves order and allows retries on next pass
        break;
      }
    }

    if (publishedIds.length > 0) {
      await this.#storage.markPublished(publishedIds);
    }
    return publishedIds.length;
  }
}
