import { describe, expect, it } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSupervisor, type ChildSpec } from "../src/lib/supervisor.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const HARNESS = path.join(FIXTURES, "supervisor-harness.ts");
const OK = path.join(FIXTURES, "ok.ts");
const FAIL = path.join(FIXTURES, "fail.ts");
const SLEEPER = path.join(FIXTURES, "sleep-until-signal.ts");

function readAll(text: string): string[] {
  return text.split("\n").filter(Boolean);
}

describe("runSupervisor (in-process)", () => {
  it("resolves 0 when every child exits 0", async () => {
    const children: ChildSpec[] = [
      { name: "a", command: ["bun", OK] },
      { name: "b", command: ["bun", OK] },
    ];
    const code = await runSupervisor(children);
    expect(code).toBe(0);
  });

  it("terminates the other children and resolves with the failing child's exit code", async () => {
    const children: ChildSpec[] = [
      { name: "failer", command: ["bun", FAIL] },
      { name: "sleeper", command: ["bun", SLEEPER] },
    ];
    const start = Date.now();
    const code = await runSupervisor(children);
    const elapsedMs = Date.now() - start;
    expect(code).toBe(7);
    // If the sleeper wasn't terminated, this would hang until the test
    // framework's own timeout instead of resolving quickly.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe("runSupervisor (signal forwarding, out-of-process)", () => {
  it("forwards SIGINT to every child and exits once they all stop", async () => {
    const specs: ChildSpec[] = [
      { name: "one", command: ["bun", SLEEPER] },
      { name: "two", command: ["bun", SLEEPER] },
    ];

    const harness = Bun.spawn(["bun", HARNESS, JSON.stringify(specs)], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutChunks: string[] = [];
    const pumpStdout = (async () => {
      const reader = harness.stdout.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        stdoutChunks.push(decoder.decode(value, { stream: true }));
      }
    })();

    // Give both children a moment to actually start before signalling.
    const deadline = Date.now() + 3000;
    while (!stdoutChunks.join("").includes("started") && Date.now() < deadline) {
      await Bun.sleep(20);
    }

    harness.kill("SIGINT");

    const exitCode = await harness.exited;
    await pumpStdout;

    const output = readAll(stdoutChunks.join(""));
    expect(output.some((l) => l.includes("HARNESS_EXIT=0"))).toBe(true);
    expect(exitCode).toBe(0);
    // Both sleepers must have actually received and handled the forwarded
    // signal, not just been killed out from under the test by a timeout.
    expect(output.filter((l) => l.includes("sleep-until-signal exiting"))).toHaveLength(2);
  });
});
