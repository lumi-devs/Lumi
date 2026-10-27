import { describe, it, expect } from "vitest";

interface LoadTestResult {
  testName: string;
  targetOpsPerSecond: number;
  actualOpsPerSecond: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  durationMs: number;
}
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runLoadTest(
  name: string,
  targetOpsPerSecond: number,
  operation: () => Promise<void>,
  durationMs: number
): Promise<LoadTestResult> {
  const latencies: number[] = [];
  let errors = 0;
  let operations = 0;
  
  const intervalMs = 1000 / targetOpsPerSecond;
  const startTime = Date.now();
  const endTime = startTime + durationMs;
  
  // Warmup
  const warmupEnd = Date.now() + 500;
  while (Date.now() < warmupEnd) {
    try { await operation(); } catch {}
  }
  
  // Actual test
  const promises: Promise<void>[] = [];
  
  while (Date.now() < endTime) {
    const loopStart = Date.now();
    
    const promise = operation()
      .then(() => {
        const latency = Date.now() - loopStart;
        latencies.push(latency);
        operations++;
      })
      .catch(() => { errors++; });
    
    promises.push(promise);
    
    const elapsed = Date.now() - loopStart;
    const sleepTime = Math.max(0, intervalMs - elapsed);
    if (sleepTime > 0) {
      await new Promise(r => setTimeout(r, sleepTime));
    }
  }
  
  await Promise.allSettled(promises);
  
  const actualDuration = Date.now() - startTime;
  const actualOpsPerSecond = (operations / actualDuration) * 1000;
  
  return {
    testName: name,
    targetOpsPerSecond,
    actualOpsPerSecond,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    errorRate: errors / Math.max(1, operations + errors),
    durationMs: actualDuration,
  };
}

describe("Load Tests", () => {
  describe("Cache Performance", () => {
    it("should handle cache operations with low latency", async () => {
      const cache = new Map<string, any>();
      
      const operation = async () => {
        if (Math.random() < 0.7) {
          cache.get(`key${Math.floor(Math.random() * 10000)}`);
        } else {
          cache.set(`key${Math.floor(Math.random() * 10000)}`, { data: "x".repeat(100) });
        }
      };
      
      const result = await runLoadTest("Cache 10k ops/sec", 10000, operation, 2000);

      expect(result.errorRate).toBeLessThan(0.01);
      expect(result.p99LatencyMs).toBeLessThan(100);
      console.log(`Cache 10k: ${result.actualOpsPerSecond.toFixed(0)} ops/s, P99: ${result.p99LatencyMs}ms`);
    });

    it("should handle higher throughput cache operations", async () => {
      const cache = new Map<string, any>();
      
      const operation = async () => {
        if (Math.random() < 0.7) {
          cache.get(`key${Math.floor(Math.random() * 100000)}`);
        } else {
          cache.set(`key${Math.floor(Math.random() * 100000)}`, { data: "x".repeat(100) });
        }
      };
      
      const result = await runLoadTest("Cache 50k ops/sec", 50000, operation, 2000);
      
      expect(result.errorRate).toBeLessThan(0.01);
      expect(result.p99LatencyMs).toBeLessThan(200);
      console.log(`Cache 50k: ${result.actualOpsPerSecond.toFixed(0)} ops/s, P99: ${result.p99LatencyMs}ms`);
    });
  });

  describe("Database Operations", () => {
    it("should handle concurrent database reads", async () => {
      const db = new Map<number, any>();
      for (let i = 0; i < 10000; i++) {
        db.set(i, { id: i, data: "x".repeat(200) });
      }
      
      const operation = async () => {
        const key = Math.floor(Math.random() * 10000);
        db.get(key);
        await Promise.resolve();
      };
      
      const result = await runLoadTest("DB Read 1k ops/sec", 1000, operation, 2000);
      
      expect(result.errorRate).toBe(0);
      expect(result.p99LatencyMs).toBeLessThan(50);
      console.log(`DB Read 1k: ${result.actualOpsPerSecond.toFixed(0)} ops/s, P99: ${result.p99LatencyMs}ms`);
    });

    it("should handle concurrent database writes", async () => {
      const db = new Map<number, any>();
      let counter = 0;
      
      const operation = async () => {
        const key = counter++;
        db.set(key, { id: key, data: "x".repeat(200), timestamp: Date.now() });
        await Promise.resolve();
      };
      
      const result = await runLoadTest("DB Write 1k ops/sec", 1000, operation, 2000);
      
      expect(result.errorRate).toBe(0);
      expect(result.p99LatencyMs).toBeLessThan(50);
      console.log(`DB Write 1k: ${result.actualOpsPerSecond.toFixed(0)} ops/s, P99: ${result.p99LatencyMs}ms`);
    });
  });

  describe("Command Processing", () => {
    it("should handle command validation throughput", async () => {
      const commands = ["ping", "ban", "kick", "timeout", "warn", "purge", "balance", "daily", "shop", "buy"];
      
      const operation = async () => {
        const cmd = commands[Math.floor(Math.random() * commands.length)];
        const args = { user: "123456789", reason: "test" };
        
        if (!cmd || !args.user) throw new Error("Invalid");
        const hasPerm = Math.random() > 0.1;
        if (!hasPerm) throw new Error("No permission");
        
        await Promise.resolve();
      };
      
      const result = await runLoadTest("Command Processing 100/sec", 100, operation, 2000);
      
      expect(result.errorRate).toBeLessThan(0.15);
      console.log(`Commands 100: ${result.actualOpsPerSecond.toFixed(0)} ops/s, P99: ${result.p99LatencyMs}ms`);
    });
  });
});