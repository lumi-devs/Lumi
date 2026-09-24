import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";
import type { ChildToHost, HostToChild } from "@lumi/contracts";
import { childEnv } from "./AddonHost.js";

const ChildEntry = fileURLToPath(new URL("../../runtime/addon-child.ts", import.meta.url));
const HelloWorld = fileURLToPath(new URL("../../../../../examples/hello-world", import.meta.url));

/**
 * Drives a real addon child process end to end — the check that the boundary
 * works at all: a separate process loads the addon, reports what it provides,
 * and can only act by asking us.
 *
 * Vitest's workers run under Node, so this launches Bun from PATH and talks
 * over a plain IPC channel rather than going through `AddonHost`'s
 * `Bun.spawn`; the child's own protocol is identical either way.
 */
describe("addon child process", () => {
  it("loads an addon, reports its commands, and answers an invocation through the host", async () => {
    const messages: ChildToHost[] = [];
    const done = Promise.withResolvers<void>();

    const child = spawn("bun", [ChildEntry], {
      cwd: HelloWorld,
      env: childEnv({ name: "hello-world", dir: HelloWorld }),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const send = (message: HostToChild) => child.send(message);

    child.on("message", (message: ChildToHost) => {
      messages.push(message);
      if (message.type === "ready") {
        send({
          type: "invoke",
          invocation: {
            kind: "command",
            invocationId: "t1",
            piece: "hello",
            guildId: "123",
            channelId: "456",
            isSlash: true,
            subcommand: null,
            user: { id: "7", username: "u", displayName: "U", bot: false, avatarUrl: null },
            member: null,
          },
        });
      }
      // The addon reads its config and replies; both must come back to us.
      if (message.type === "rpc-request") {
        send({ type: "rpc-response", response: { id: message.request.id, ok: true, data: null } });
      }
      if (message.type === "invocation-done") done.resolve();
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("exit", (code) =>
      done.reject(new Error(`child exited early (${code}): ${stderr}`)),
    );

    try {
      await done.promise;
    } finally {
      child.kill();
    }

    const ready = messages.find((m) => m.type === "ready");
    expect(ready).toBeDefined();
    expect(ready!.commands.map((c) => c.name)).toEqual(["hello"]);
    // The builder JSON is produced child-side; it is what the host registers.
    expect(ready!.commands[0]!.builder).toMatchObject({ name: "hello" });

    const calls = messages.filter((m) => m.type === "rpc-request").map((m) => m.request.action);
    expect(calls).toContain("config.get");
    expect(calls).toContain("ctx.reply");

    const finished = messages.find((m) => m.type === "invocation-done");
    expect(finished?.invocationId).toBe("t1");
    expect(finished?.error).toBeUndefined();
  }, 30_000);

  it("fails to load an addon directory that does not exist", async () => {
    const missing = path.join(HelloWorld, "..", "no-such-addon");
    const child = spawn("bun", [ChildEntry], {
      env: childEnv({ name: "no-such-addon", dir: missing }),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    const message = await new Promise<ChildToHost>((resolve, reject) => {
      child.once("message", resolve as (m: unknown) => void);
      child.once("exit", () => reject(new Error("exited without reporting")));
    }).finally(() => child.kill());

    expect(message.type).toBe("load-failed");
  }, 30_000);
});
