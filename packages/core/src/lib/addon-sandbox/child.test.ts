import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";
import { FakeAddonHost } from "./test-harness.js";

const HelloWorld = fileURLToPath(new URL("../../../tests/fixtures/addons/hello-world", import.meta.url));

/**
 * Drives a real addon child process end to end — the check that the boundary
 * works at all: a separate process loads the addon, reports what it provides,
 * and can only act by asking us. `FakeAddonHost` (./test-harness.ts) is the
 * same driver `lumi addon test` uses, so the protocol only has one
 * implementation.
 */
describe("addon child process", () => {
  it("loads an addon, reports its commands, and answers an invocation through the host", async () => {
    const host = new FakeAddonHost({ name: "hello-world", dir: HelloWorld });
    try {
      const ready = await host.ready();
      expect(ready.commands.map((c) => c.name)).toEqual(["hello"]);
      expect(ready.configFields).toMatchObject([{ key: "greeting", type: "STRING" }]);
      // The builder JSON is produced child-side; it is what the host registers.
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
    const host = new FakeAddonHost({ name: "no-such-addon", dir: `${HelloWorld}/../no-such-addon` });
    try {
      await expect(host.ready()).rejects.toThrow();
    } finally {
      host.stop();
    }
  }, 30_000);
});
