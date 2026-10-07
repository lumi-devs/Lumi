export interface ChildSpec {
  name: string;
  command: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
}

interface TrackedChild {
  name: string;
  proc: ReturnType<typeof Bun.spawn>;
}

function pumpPrefixed(
  name: string,
  width: number,
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  out: { write(chunk: string): unknown },
): Promise<void> {
  if (!stream || typeof stream === "number") return Promise.resolve();
  return (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) out.write(`[${name.padEnd(width)}] ${line}\n`);
    }
    if (buffered.length > 0) out.write(`[${name.padEnd(width)}] ${buffered}\n`);
  })();
}

/**
 * This is the `lumi start all` supervisor (#33/#99's single-process-install
 * story): one command, three still-separate processes. True single-address-
 * space isn't done because `container` (`packages/core/src/lib/services.ts`)
 * is a process-wide global singleton - three in-process bootstraps (worker/api/scheduler)
 * would each overwrite the others' `container.client`/`container.db`/etc.
 * Sharing a process would need the module system, RPC server, and BullMQ
 * worker to all agree on one container, which they don't today.
 */
export async function runSupervisor(children: ChildSpec[]): Promise<number> {
  if (children.length === 0) return 0;

  const tracked: TrackedChild[] = children.map((c) => ({
    name: c.name,
    proc: Bun.spawn(c.command, {
      cwd: c.cwd,
      env: (c.env ?? process.env),
      stdout: "pipe",
      stderr: "pipe",
    }),
  }));

  const width = Math.max(...children.map((c) => c.name.length));
  const pumps = tracked.flatMap(({ name, proc }) => [
    pumpPrefixed(name, width, proc.stdout, process.stdout),
    pumpPrefixed(name, width, proc.stderr, process.stderr),
  ]);

  let winningExitCode: number | null = null;
  const terminateExcept = (except: string) => {
    for (const { name, proc } of tracked) {
      if (name === except) continue;
      try {
        proc.kill("SIGTERM");
      } catch {
      }
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    for (const { proc } of tracked) {
      try {
        proc.kill(signal);
      } catch {
      }
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const results = await Promise.all(
      tracked.map(async ({ name, proc }) => {
        const code = await proc.exited;
        if (winningExitCode === null && code !== 0) {
          winningExitCode = code;
          terminateExcept(name);
        }
        return code;
      }),
    );
    await Promise.all(pumps);
    return winningExitCode ?? results.find((c) => c !== 0) ?? 0;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
