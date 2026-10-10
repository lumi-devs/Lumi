import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddonRpcResponse, ChildToHost, HostToChild } from "@lumi/contracts";
import { makeRpcFailure, RpcFailureCodes } from "@lumi/contracts/rpc";
import type { ModuleRecord } from "@lumi/lib/module-system/module-store.js";
import { AddonHost } from "../host/addon-host.js";
import { buildIsolateBundle, IsolateRunnerEntry } from "./isolate-build.js";
import { forEachLine } from "./ndjson.js";
import { FakeAddonHost } from "./test-harness.js";

const SelfDir = path.dirname(fileURLToPath(import.meta.url));
const FixtureSrc = path.resolve(SelfDir, "../../../../tests/fixtures/addons/hello-world");

const nodeBin = Bun.which("node");
const describeIfNode = nodeBin ? describe : describe.skip;

let tmpRoot = "";

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-isolate-test-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function fixtureCopy(): Promise<string> {
  const dir = path.join(tmpRoot, "hello-world");
  await fs.cp(FixtureSrc, dir, { recursive: true });
  return dir;
}

function recordFor(dir: string): ModuleRecord {
  return {
    name: "hello-world",
    dir,
    indexUrl: path.join(dir, "index.ts"),
    enabled: true,
    meta: { name: "hello-world", displayName: "Hello", configFields: [] },
    manifest: { capabilities: { discord: ["reply"], kv: true } },
    targetUtility: "worker",
  } as unknown as ModuleRecord;
}

describeIfNode("addon isolate", () => {
  it("loads an addon, reports its commands, and answers an invocation through the host", async () => {
    const host = await FakeAddonHost.create({ name: "hello-world", dir: await fixtureCopy() });
    try {
      const ready = await host.ready();
      expect(ready.commands.map((c) => c.name)).toEqual(["hello"]);
      expect(ready.configFields).toMatchObject([{ key: "greeting", type: "STRING" }]);
      expect(ready.commands[0]!.builder).toMatchObject({ name: "hello" });

      await host.invoke({
        kind: "command",
        invocationId: "t1",
        piece: "hello",
        guildId: "123",
        channelId: "456",
        isSlash: true,
        subcommand: null,
        user: { id: "7", username: "u", displayName: "U", bot: false, avatarUrl: null },
        member: null,
        repliedToId: null,
      });

      expect(host.rpcCalls()).toContain("config.get");
      expect(host.rpcCalls()).toContain("ctx.reply");
    } finally {
      host.stop();
    }
  }, 30_000);

  it("fails to load an addon directory that does not exist", async () => {
    await expect(
      FakeAddonHost.create({ name: "no-such-addon", dir: path.join(tmpRoot, "no-such-addon") }),
    ).rejects.toThrow("does not exist");
  }, 30_000);

  it("starts through AddonHost and reports descriptors", async () => {
    const host = new AddonHost();
    try {
      const commands = await host.start(recordFor(await fixtureCopy()));
      expect(commands.map((c) => c.name)).toEqual(["hello"]);
      expect(host.configFieldsFor("hello-world").map((f) => f.key)).toEqual(["greeting"]);
    } finally {
      host.stopAll();
    }
  }, 60_000);

  it("runs a command over raw NDJSON stdio with no ambient authority", async () => {
    const bundle = await buildIsolateBundle(await fixtureCopy(), "hello-world");
    const replies: unknown[] = [];
    let ready!: (v: Extract<ChildToHost, { type: "ready" }>) => void;
    let done!: () => void;
    const readyP = new Promise<Extract<ChildToHost, { type: "ready" }>>((r) => (ready = r));
    const doneP = new Promise<void>((r) => (done = r));

    const proc = Bun.spawn([nodeBin!, "--no-node-snapshot", IsolateRunnerEntry, bundle.path], {
      env: { PATH: process.env.PATH ?? "" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      onExit: () => done(),
    });

    const send = (message: HostToChild) => {
      const stdin = proc.stdin;
      if (typeof stdin !== "number" && stdin) {
        void stdin.write(`${JSON.stringify(message)}\n`);
        void stdin.flush();
      }
    };

    const onLine = (line: string) => {
      let raw: ChildToHost;
      try {
        raw = JSON.parse(line) as ChildToHost;
      } catch {
        return;
      }
      switch (raw.type) {
        case "ready":
          ready(raw);
          return;
        case "rpc-request": {
          const respond = (response: AddonRpcResponse) =>
            send({ type: "rpc-response", response });
          if (raw.request.action === "config.get")
            void respond({ id: raw.request.id, ok: true, data: "Howdy" });
          else if (raw.request.action === "ctx.reply") {
            replies.push(raw.request.data);
            void respond({ id: raw.request.id, ok: true, data: null });
          } else
            void respond(makeRpcFailure(raw.request.id, "unexpected", RpcFailureCodes.HandlerError));
          return;
        }
        case "invocation-done":
          if (raw.error) throw new Error(raw.error);
          done();
          return;
        case "load-failed":
          throw new Error(raw.error);
      }
    };

    void forEachLine(proc.stdout, onLine);

    const timeout = setTimeout(() => {
      throw new Error("isolate e2e timed out");
    }, 30_000);
    try {
      await readyP;
      send({
        type: "invoke",
        invocation: {
          kind: "command",
          invocationId: "hello-world:1",
          piece: "hello",
          guildId: "g1",
          channelId: "c1",
          isSlash: true,
          subcommand: null,
          user: { id: "u1", username: "t", displayName: "T", bot: false, avatarUrl: null },
          member: null,
          repliedToId: null,
        },
      });
      await doneP;
      expect(JSON.stringify(replies)).toContain("Howdy");
    } finally {
      clearTimeout(timeout);
      proc.kill();
    }
  }, 60_000);

  it("serializes concurrent invokes so host calls cannot cross scopes", async () => {
    const bundle = await buildIsolateBundle(await fixtureCopy(), "hello-world");
    const doneIds: string[] = [];
    const callOrder: string[] = [];
    let ready!: () => void;
    let bothDone!: () => void;
    const readyP = new Promise<void>((r) => (ready = r));
    const bothP = new Promise<void>((r) => (bothDone = r));

    const proc = Bun.spawn([nodeBin!, "--no-node-snapshot", IsolateRunnerEntry, bundle.path], {
      env: { PATH: process.env.PATH ?? "" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      onExit: () => {},
    });

    const send = (message: HostToChild) => {
      const stdin = proc.stdin;
      if (typeof stdin !== "number" && stdin) {
        void stdin.write(`${JSON.stringify(message)}\n`);
        void stdin.flush();
      }
    };

    const onLine = (line: string) => {
      let raw: ChildToHost;
      try {
        raw = JSON.parse(line) as ChildToHost;
      } catch {
        return;
      }
      if (raw.type === "ready") {
        ready();
        return;
      }
      if (raw.type === "rpc-request") {
        callOrder.push(raw.request.invocationId ?? "?");
        send({
          type: "rpc-response",
          response: { id: raw.request.id, ok: true, data: raw.request.action === "config.get" ? "x" : null },
        });
        return;
      }
      if (raw.type === "invocation-done" && !raw.error) {
        doneIds.push(raw.invocationId);
        if (doneIds.length === 2) bothDone();
      }
    };

    void forEachLine(proc.stdout, onLine);

    const invoke = (n: number) =>
      send({
        type: "invoke",
        invocation: {
          kind: "command",
          invocationId: `hello-world:${n}`,
          piece: "hello",
          guildId: "g1",
          channelId: "c1",
          isSlash: true,
          subcommand: null,
          user: { id: "u1", username: "t", displayName: "T", bot: false, avatarUrl: null },
          member: null,
          repliedToId: null,
        },
      });

    const timeout = setTimeout(() => {
      throw new Error("isolate e2e timed out");
    }, 30_000);
    try {
      await readyP;
      invoke(1);
      invoke(2);
      await bothP;
      expect(doneIds.sort()).toEqual(["hello-world:1", "hello-world:2"]);
      const firstTwo = callOrder.indexOf("hello-world:2");
      const lastOne = callOrder.lastIndexOf("hello-world:1");
      const firstOne = callOrder.indexOf("hello-world:1");
      const lastTwo = callOrder.lastIndexOf("hello-world:2");
      expect(lastOne < firstTwo || lastTwo < firstOne).toBe(true);
    } finally {
      clearTimeout(timeout);
      proc.kill();
    }
  }, 60_000);
});
