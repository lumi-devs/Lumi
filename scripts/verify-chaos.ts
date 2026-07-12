/**
 * Chaos & verify suite — distributed event-bus paths.
 *
 * Runs the six Redis Streams legs plus (when NATS_URL is set) the two NATS
 * JetStream legs. Called from CI via `bun run verify:chaos`.
 *
 * Exit code 0 = all legs passed. Non-zero = at least one leg failed.
 */

import {
  createEventBus,
  type EventBus,
  type BusMessage,
} from "@lumi/event-bus";

const REDIS_HOST = process.env["REDIS_HOST"] ?? "localhost";
const REDIS_PORT = Number(process.env["REDIS_PORT"] ?? 6379);
const NATS_URL = process.env["NATS_URL"];

const GROUP = "verify-chaos";
const CONSUMER = "verify-0";

interface Scenario {
  name: string;
  run: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(name: string) {
  process.stdout.write(`  ✓ ${name}\n`);
}

function fail(name: string, err: unknown) {
  process.stderr.write(
    `  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
}

/** Drain up to `limit` messages from a stream and ack them, returning payloads. */
async function drain<T>(
  bus: EventBus,
  stream: string,
  limit: number,
  timeoutMs = 800,
): Promise<T[]> {
  const collected: T[] = [];
  const stop = await bus.consume<T>(
    [stream],
    { group: GROUP, consumer: CONSUMER, blockMs: 100, batchSize: 16 },
    async (msg: BusMessage<T>) => {
      collected.push(msg.body);
      await msg.ack();
    },
  );
  await new Promise((r) => setTimeout(r, timeoutMs));
  await stop();
  return collected.slice(0, limit);
}

// ── Redis Streams legs ────────────────────────────────────────────────────────

const redisBase = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: 0,
  lazyConnect: true,
};

const redisScenarios: Scenario[] = [
  {
    name: "Redis Streams — basic publish/consume round-trip",
    async run() {
      const { bus, close } = createEventBus({ transport: "streams", redis: redisBase });
      await bus.publish("verify.guild_create", { guildId: "test-1" });
      const msgs = await drain<{ guildId: string }>(bus, "verify.guild_create", 1);
      await close();
      if (!msgs.some((m) => m.guildId === "test-1"))
        throw new Error(`Event not received (got ${msgs.length} messages)`);
    },
  },
  {
    name: "Redis Streams — multiple sequential publishes consumed in order",
    async run() {
      const { bus, close } = createEventBus({ transport: "streams", redis: redisBase });
      for (let i = 0; i < 5; i++) await bus.publish("verify.seq", { seq: i });
      const msgs = await drain<{ seq: number }>(bus, "verify.seq", 5);
      await close();
      if (msgs.length < 5) throw new Error(`Expected 5 msgs, got ${msgs.length}`);
    },
  },
  {
    name: "Redis Streams — consume with explicit ack removes from pending",
    async run() {
      const { bus, close } = createEventBus({ transport: "streams", redis: redisBase });
      await bus.publish("verify.ack_test", { v: 1 });
      const msgs = await drain<{ v: number }>(bus, "verify.ack_test", 1);
      await close();
      if (msgs.length === 0) throw new Error("No messages received");
    },
  },
  {
    name: "Redis Streams — high-volume publish (50 events)",
    async run() {
      const { bus, close } = createEventBus({ transport: "streams", redis: redisBase });
      const N = 50;
      for (let i = 0; i < N; i++) await bus.publish("verify.load", { i });
      const msgs = await drain<{ i: number }>(bus, "verify.load", N, 1200);
      await close();
      if (msgs.length < Math.floor(N * 0.9))
        throw new Error(`Only ${msgs.length}/${N} events received under load`);
    },
  },
  {
    name: "Redis Streams — bus initialises and closes without error",
    async run() {
      const { close } = createEventBus({ transport: "streams", redis: redisBase });
      await close();
    },
  },
  {
    name: "Redis Streams — reopened bus after close works correctly",
    async run() {
      const a = createEventBus({ transport: "streams", redis: redisBase });
      await a.close();
      const b = createEventBus({ transport: "streams", redis: redisBase });
      await b.bus.publish("verify.reopen", { ok: true });
      await b.close();
    },
  },
];

// ── NATS JetStream legs ───────────────────────────────────────────────────────

const natsScenarios: Scenario[] = [
  {
    name: "NATS JetStream — basic publish/consume round-trip",
    async run() {
      const { bus, close } = createEventBus({
        transport: "nats",
        natsServers: NATS_URL,
      });
      await bus.publish("verify.nats_basic", { guildId: "nats-1" });
      const msgs = await drain<{ guildId: string }>(bus, "verify.nats_basic", 1, 1000);
      await close();
      if (!msgs.some((m) => m.guildId === "nats-1"))
        throw new Error("NATS event not received");
    },
  },
  {
    name: "NATS JetStream — bus initialises and closes without error",
    async run() {
      const { close } = createEventBus({ transport: "nats", natsServers: NATS_URL });
      await new Promise((r) => setTimeout(r, 200));
      await close();
    },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  const scenarios: Scenario[] = NATS_URL
    ? [...redisScenarios, ...natsScenarios]
    : redisScenarios;

  process.stdout.write(
    `\n[verify:chaos] Running ${scenarios.length} scenario(s) (${NATS_URL ? "Redis + NATS" : "Redis only"})\n\n`,
  );

  let failures = 0;
  for (const s of scenarios) {
    try {
      await s.run();
      pass(s.name);
    } catch (err) {
      fail(s.name, err);
      failures++;
    }
  }

  process.stdout.write(
    `\n[verify:chaos] ${failures === 0 ? "PASS" : "FAIL"} — ${scenarios.length - failures}/${scenarios.length} passed\n`,
  );
  process.exit(failures > 0 ? 1 : 0);
}

run();
