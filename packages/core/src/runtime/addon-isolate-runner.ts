import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import ivm from "isolated-vm";
import type {
  AddonReady,
  AddonRpcMethod,
  ChildToHost,
  HostToChild,
  RpcLogLevel,
} from "@lumi/contracts";

for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  console[method] = (...args: unknown[]) => {
    process.stderr.write(`${args.map(String).join(" ")}\n`);
  };
}

const bundlePath = process.argv[2];

function send(message: ChildToHost): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (!bundlePath) {
  send({ type: "load-failed", error: "Isolate runner started without a bundle path" });
  process.exit(1);
}

interface HostCallPayload {
  action: AddonRpcMethod;
  data: unknown;
}

let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let activeInvocation: string | null = null;

function hostCall({ action, data }: HostCallPayload): Promise<unknown> {
  if (!activeInvocation) throw new Error("No active invocation for this call");
  const id = `h${++seq}`;
  const invocationId = activeInvocation;
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "rpc-request", request: { id, action, data, invocationId } });
  });
}

const MaxLogsPerInvocation = 100;
let logsSent = 0;

function log(level: RpcLogLevel, text: unknown): void {
  if (logsSent >= MaxLogsPerInvocation) return;
  logsSent++;
  send({ type: "log", level, message: String(text).slice(0, 2000) });
}

let invokeRef: ivm.Reference | null = null;
let isolate: ivm.Isolate;

async function isolateAlive(): Promise<boolean> {
  try {
    await (await isolate.compileScript("0")).run(await isolate.createContext(), { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

const queue: Array<() => Promise<void>> = [];
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) await queue.shift()!();
  } finally {
    pumping = false;
  }
}

function onLine(line: string): void {
  let message: HostToChild;
  try {
    message = JSON.parse(line) as HostToChild;
  } catch {
    return;
  }
  if (message?.type === "rpc-response") {
    const entry = pending.get(message.response.id);
    if (!entry) return;
    pending.delete(message.response.id);
    if (message.response.ok) entry.resolve(message.response.data);
    else entry.reject(new Error(message.response.error));
    return;
  }
  if (message?.type === "invoke") {
    const { invocationId } = message.invocation;
    const invocation = message.invocation;
    queue.push(async () => {
      logsSent = 0;
      activeInvocation = invocationId;
      try {
        await invokeRef!.apply(undefined, [invocation], {
          arguments: { copy: true },
          result: { promise: true, copy: true },
        });
        send({ type: "invocation-done", invocationId });
      } catch (err: unknown) {
        send({
          type: "invocation-done",
          invocationId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!(await isolateAlive())) process.exit(1);
      } finally {
        activeInvocation = null;
      }
    });
    void pump();
    return;
  }
  if (message?.type === "shutdown") process.exit(0);
}

try {
  const source = readFileSync(bundlePath, "utf8");
  isolate = new ivm.Isolate({
    memoryLimit: Number(process.env.LUMI_ISOLATE_MEMORY_MB ?? 128),
  });
  const context = await isolate.createContext();
  const jail = context.global;
  await jail.set("global", jail.derefInto());
  await jail.set("__hostCall", new ivm.Reference(hostCall));
  await jail.set("__logEvent", new ivm.Callback(({ level, text }: { level: RpcLogLevel; text: unknown }) => log(level, text)));
  await context.eval(`
    console = {
      debug: (...a) => __logEvent({ level: "debug", text: a.map(String).join(" ") }),
      info: (...a) => __logEvent({ level: "info", text: a.map(String).join(" ") }),
      log: (...a) => __logEvent({ level: "info", text: a.map(String).join(" ") }),
      warn: (...a) => __logEvent({ level: "warn", text: a.map(String).join(" ") }),
      error: (...a) => __logEvent({ level: "error", text: a.map(String).join(" ") }),
    };
  `);
  await (await isolate.compileScript(source)).run(context, { timeout: 15_000 });

  const describeRef = await jail.get("__describe", { reference: true });
  const described = (await describeRef.apply(undefined, [], {
    result: { promise: true, copy: true },
    timeout: 15_000,
  })) as Omit<AddonReady, "type">;
  invokeRef = await jail.get("__invoke", { reference: true });
  send({ type: "ready", ...described });

  createInterface({ input: process.stdin, terminal: false }).on("line", onLine);
} catch (err: unknown) {
  send({ type: "load-failed", error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}
