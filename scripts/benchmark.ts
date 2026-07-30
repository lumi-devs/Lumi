import { performance } from "perf_hooks";
import { evaluateNodeMatch } from "#lib/permissions/PermitResolver.js";
import { makeInfoCard, makeSuccessCard } from "#lib/utilities/cards.js";
import { userMention, roleMention, channelMention, time } from "@discordjs/formatters";
import { cutText, isNullish } from "@sapphire/utilities";

// Helper: Calculate P99 Latency
function calculateP99(latencies: number[]): number {
  if (!latencies.length) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p99Index = Math.floor(sorted.length * 0.99);
  return sorted[p99Index] ?? 0;
}

const fmt = (num: number) => new Intl.NumberFormat("en-US").format(Math.floor(num));
const fmtMem = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function runBenchmarks() {
  const results: Record<string, string | number>[] = [];
  const WARMUP_ITERATIONS = 5_000;
  const ITERATIONS = 50_000;

  // 1. Permission Resolver Benchmark (Permit Node Matching)
  {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      evaluateNodeMatch("mod.*", "mod.ban");
    }

    const latencies: number[] = [];
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = performance.now();
      evaluateNodeMatch("mod.*", "mod.ban");
      evaluateNodeMatch("admin.*", "mod.kick");
      evaluateNodeMatch("*", "user.profile");
      latencies.push(performance.now() - opStart);
    }
    const end = performance.now();
    const opsSec = (ITERATIONS * 3) / ((end - start) / 1000);

    results.push({
      Target: "PermitResolver (Wildcard Node Match)",
      "Ops/sec": fmt(opsSec),
      "P99 Latency": `${calculateP99(latencies).toFixed(4)} ms`,
    });
  }

  // 2. Card Generator UI System Benchmark
  {
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      makeInfoCard("Warmup Title", "Warmup Body");
    }

    const latencies: number[] = [];
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = performance.now();
      makeInfoCard("Info Card Title", "Some info card body text", { footer: "Test footer" });
      makeSuccessCard("Success Card Title", ["Line 1", "Line 2"], { divider: true });
      latencies.push(performance.now() - opStart);
    }
    const end = performance.now();
    const opsSec = (ITERATIONS * 2) / ((end - start) / 1000);

    results.push({
      Target: "Card Generator (makeInfoCard & makeSuccessCard)",
      "Ops/sec": fmt(opsSec),
      "P99 Latency": `${calculateP99(latencies).toFixed(4)} ms`,
    });
  }

  // 3. Discord.js Formatters & Sapphire Utilities Benchmark
  {
    const sampleDate = new Date();
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      userMention("123456789012345678");
    }

    const latencies: number[] = [];
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = performance.now();
      userMention("123456789012345678");
      roleMention("987654321098765432");
      channelMention("112233445566778899");
      time(sampleDate, "R");
      cutText("Short text summary", 10);
      isNullish(null);
      latencies.push(performance.now() - opStart);
    }
    const end = performance.now();
    const opsSec = (ITERATIONS * 6) / ((end - start) / 1000);

    results.push({
      Target: "Discord Formatters & Sapphire Utilities",
      "Ops/sec": fmt(opsSec),
      "P99 Latency": `${calculateP99(latencies).toFixed(4)} ms`,
    });
  }

  // Memory Statistics
  if (global.gc) {
    global.gc();
  }
  const mem = process.memoryUsage();

  // Print Markdown Results Table
  console.log("### ⚡ Benchmark Results\n");
  console.log("| Target Subsystem | Operations / Second | P99 Latency |");
  console.log("| :--- | :---: | :---: |");
  for (const row of results) {
    console.log(`| **${row.Target}** | \`${row["Ops/sec"]}\` | \`${row["P99 Latency"]}\` |`);
  }

  console.log("\n### 🧠 Memory Profile (Post-Benchmark)\n");
  console.log("| Metric | Allocated Value |");
  console.log("| :--- | :---: |");
  console.log(`| **RSS** | \`${fmtMem(mem.rss)}\` |`);
  console.log(`| **Heap Total** | \`${fmtMem(mem.heapTotal)}\` |`);
  console.log(`| **Heap Used** | \`${fmtMem(mem.heapUsed)}\` |`);
  console.log(`| **External** | \`${fmtMem(mem.external)}\` |`);
}

runBenchmarks();
