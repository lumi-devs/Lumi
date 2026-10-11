

export interface BusMessage<T = unknown> {

  id: string;

  body: T;

  deliveryCount: number;

  ack: () => Promise<void>;

  nack: () => Promise<void>;
}

export interface PublishOptions {

  maxLen?: number;
}

export interface ConsumeOptions {

  group: string;

  consumer: string;

  blockMs?: number;

  batchSize?: number;
  startId?: string;
}

export interface EventBus {

  publish<T>(stream: string, body: T, opts?: PublishOptions): Promise<string>;

  consume<T>(
    streams: readonly string[],
    opts: ConsumeOptions,
    handler: (msg: BusMessage<T>) => Promise<void>,
  ): Promise<() => Promise<void>>;

  destroyGroup(stream: string, group: string): Promise<void>;

  close(): Promise<void>;
}

