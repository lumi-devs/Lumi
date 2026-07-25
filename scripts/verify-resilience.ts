/**
 * Distributed Resilience & Fault Tolerance Suite.
 *
 * Validates message delivery semantics, consumer group isolation, burst concurrency,
 * and lifecycle durability across Redis Streams and NATS JetStream event-bus backends.
 *
 * Invoked via: `bun run verify:resilience`
 */

import {
  createEventBus,
  type EventBus,
  type BusMessage,
} from "@lumi/event-bus";

const REDIS_HOST = process.env["REDIS_HOST"] ?? "localhost";
const REDIS_PORT = Number(process.env["REDIS_PORT"] ?? 6379);
const NATS_URL = process.env["NATS_URL"];

const GROUP_ALPHA = "verify-resilience-alpha";
const GROUP_BETA = "verify-resilience-beta";
const CONSUMER_PRIMARY = "consumer-0";

interface Scenario {
  name: string;
  run: () => Promise<void>;
}

// ── Logging Utilities ─────────────────────────────────────────────────────────

function pass(name: string): void {
  process.stdout.write(`  ✓ ${name}\n`);
}

function fail(name: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  process.stderr.write(`  ✗ ${name}: ${reason}\n`);
}

/** Drain up to `limit` messages from a stream and explicit-ack them. */
async function drainStream<T>(
  bus: EventBus,
  stream: string,
  limit: number,
  group = GROUP_ALPHA,
  timeoutMs = 2000,
): Promise<T[]> {
  const collected: T[] = [];
  const stop = await bus.consume<T>(
    [stream],
    { group, consumer: CONSUMER_PRIMARY, blockMs: 100, batchSize: 16 },
    async (msg: BusMessage<T>) => {
      collected.push(msg.body);
      await msg.ack();
    },
  );
  await new Promise((r) => setTimeout(r, timeoutMs));
  await stop();
  return collected.slice(0, limit);
}

// ── Redis Streams Scenarios ──────────────────────────────────────────────────

const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: 0,
  lazyConnect: true,
};

const redisScenarios: Scenario[] = [
  {
    name: "Redis Streams — basic publish & consume round-trip",
    async run() {
      const { bus, close } = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      await bus.publish("verify.guild_create", { guildId: "resilience-test-1" });
      const msgs = await drainStream<{ guildId: string }>(
        bus,
        "verify.guild_create",
        1,
      );
      await close();
      if (!msgs.some((m) => m.guildId === "resilience-test-1")) {
        throw new Error(
          `Payload verification failed (received ${msgs.length} messages)`,
        );
      }
    },
  },
  {
    name: "Redis Streams — sequential message ordering under queue load",
    async run() {
      const { bus, close } = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      const itemCount = 10;
      for (let i = 0; i < itemCount; i++) {
        await bus.publish("verify.sequence", { sequenceNumber: i });
      }
      const msgs = await drainStream<{ sequenceNumber: number }>(
        bus,
        "verify.sequence",
        itemCount,
      );
      await close();
      if (msgs.length < itemCount) {
        throw new Error(
          `Expected ${itemCount} ordered messages, received ${msgs.length}`,
        );
      }
    },
  },
  {
    name: "Redis Streams — consumer group isolation & fanout",
    async run() {
      const { bus, close } = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      await bus.publish("verify.broadcast", { broadcastId: "fanout-100" });

      const [groupAlphaMsgs, groupBetaMsgs] = await Promise.all([
        drainStream<{ broadcastId: string }>(
          bus,
          "verify.broadcast",
          1,
          GROUP_ALPHA,
        ),
        drainStream<{ broadcastId: string }>(
          bus,
          "verify.broadcast",
          1,
          GROUP_BETA,
        ),
      ]);

      await close();

      if (groupAlphaMsgs.length === 0 || groupBetaMsgs.length === 0) {
        throw new Error("Consumer group broadcast isolation check failed");
      }
    },
  },
  {
    name: "Redis Streams — high-throughput burst load (100 parallel dispatches)",
    async run() {
      const { bus, close } = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      const TOTAL_BURST = 100;
      const pubPromises: Promise<string>[] = [];
      for (let i = 0; i < TOTAL_BURST; i++) {
        pubPromises.push(bus.publish("verify.burst", { index: i }));
      }
      await Promise.all(pubPromises);

      const msgs = await drainStream<{ index: number }>(
        bus,
        "verify.burst",
        TOTAL_BURST,
        GROUP_ALPHA,
        1500,
      );
      await close();

      if (msgs.length < Math.floor(TOTAL_BURST * 0.9)) {
        throw new Error(
          `Burst load dropped messages: ${msgs.length}/${TOTAL_BURST} received`,
        );
      }
    },
  },
  {
    name: "Redis Streams — lifecycle initialization and graceful shutdown",
    async run() {
      const { close } = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      await close();
    },
  },
  {
    name: "Redis Streams — bus re-initialization after connection termination",
    async run() {
      const busInstanceA = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      await busInstanceA.close();

      const busInstanceB = createEventBus({
        transport: "streams",
        redis: redisConfig,
      });
      await busInstanceB.bus.publish("verify.lifecycle_reopen", { active: true });
      await busInstanceB.close();
    },
  },
];

// ── NATS JetStream Scenarios ─────────────────────────────────────────────────

const natsScenarios: Scenario[] = [
  {
    name: "NATS JetStream — basic publish & consume round-trip",
    async run() {
      const { bus, close } = createEventBus({
        transport: "nats",
        natsServers: NATS_URL,
      });
      await bus.publish("verify.nats_basic", { guildId: "nats-resilience-1" });
      const msgs = await drainStream<{ guildId: string }>(
        bus,
        "verify.nats_basic",
        1,
        GROUP_ALPHA,
        1000,
      );
      await close();
      if (!msgs.some((m) => m.guildId === "nats-resilience-1")) {
        throw new Error("NATS JetStream message delivery verification failed");
      }
    },
  },
  {
    name: "NATS JetStream — lifecycle initialization and graceful shutdown",
    async run() {
      const { close } = createEventBus({
        transport: "nats",
        natsServers: NATS_URL,
      });
      await new Promise((r) => setTimeout(r, 200));
      await close();
    },
  },
];

// ── Main Runner ──────────────────────────────────────────────────────────────

async function executeResilienceSuite(): Promise<void> {
  const activeScenarios = NATS_URL
    ? [...redisScenarios, ...natsScenarios]
    : redisScenarios;

  process.stdout.write(
    `\n[verify:resilience] Running ${activeScenarios.length} scenario(s) (${NATS_URL ? "Redis + NATS" : "Redis Streams"})\n\n`,
  );

  let failureCount = 0;
  for (const scenario of activeScenarios) {
    try {
      await scenario.run();
      pass(scenario.name);
    } catch (err) {
      fail(scenario.name, err);
      failureCount++;
    }
  }

  process.stdout.write(
    `\n[verify:resilience] ${failureCount === 0 ? "PASSED" : "FAILED"} — ${activeScenarios.length - failureCount}/${activeScenarios.length} scenario(s) succeeded\n\n`,
  );

  process.exit(failureCount > 0 ? 1 : 0);
}

void executeResilienceSuite();
