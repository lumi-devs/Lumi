import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { UserCommand as NickCommand } from "../../../src/modules/utility/commands/nick.js";

function fakeMember(id: string, position: number) {
  return {
    id,
    roles: { highest: { position } },
    setNickname: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function fakeContext(opts: {
  invoker: ReturnType<typeof fakeMember>;
  target: ReturnType<typeof fakeMember>;
  ownerId?: string;
}) {
  return {
    fetchT: vi.fn().mockResolvedValue((key: string) => key),
    getMember: vi.fn().mockResolvedValue(opts.target),
    getString: vi.fn().mockResolvedValue("NewNick"),
    user: { id: opts.invoker.id, tag: "invoker#0001" },
    member: opts.invoker,
    guild: {
      ownerId: opts.ownerId ?? "owner-1",
      members: { me: fakeMember("bot-1", 999) },
    },
    replyError: vi.fn().mockResolvedValue(undefined),
    replyWarning: vi.fn().mockResolvedValue(undefined),
    replySuccess: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("nick command hierarchy check", () => {
  let command: NickCommand;

  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;
    (container as any).client = { options: {} } as any;

    command = new NickCommand(
      {
        name: "nick",
        path: "/path/to/nick.ts",
        root: "/path/to",
        store: { name: "commands" } as any,
      } as any,
      {},
    );
  });

  it("denies renaming a member who outranks the invoker, even below the bot", async () => {
    const invoker = fakeMember("mod-1", 5);
    const target = fakeMember("target-1", 10);
    const ctx = fakeContext({ invoker, target });

    await command.run(ctx);

    expect(ctx.replyError).toHaveBeenCalled();
    expect(target.setNickname).not.toHaveBeenCalled();
  });

  it("allows renaming a member the invoker outranks", async () => {
    const invoker = fakeMember("mod-1", 10);
    const target = fakeMember("target-1", 5);
    const ctx = fakeContext({ invoker, target });

    await command.run(ctx);

    expect(target.setNickname).toHaveBeenCalledWith("NewNick");
    expect(ctx.replySuccess).toHaveBeenCalled();
  });

  it("exempts the guild owner from the invoker hierarchy check", async () => {
    const invoker = fakeMember("owner-1", 0);
    const target = fakeMember("target-1", 50);
    const ctx = fakeContext({ invoker, target, ownerId: "owner-1" });

    await command.run(ctx);

    expect(target.setNickname).toHaveBeenCalledWith("NewNick");
  });
});
