import { describe, it, expect, vi, beforeEach } from "bun:test";
import mentionsButton from "@lumi/modules/afk/interactions/buttons/mentions.js";
import { AfkMentionsId } from "@lumi/modules/afk/constants.js";
import { InteractionAccessDeniedError } from "@lumi/lib/interactions/interaction-def.js";

vi.mock("@lumi/modules/afk/data/afk.js", () => ({
  getAfkMentions: vi.fn(),
}));

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

import { getAfkMentions } from "@lumi/modules/afk/data/afk.js";

const USER_ID = "111111111111111111";

function makeInteraction(customId: string, opts: { guildId?: string | null; userId?: string; ephemeral?: boolean } = {}) {
  return {
    customId,
    guildId: opts.guildId === undefined ? "g1" : opts.guildId,
    user: { id: opts.userId ?? USER_ID },
    message: { flags: { has: vi.fn().mockReturnValue(opts.ephemeral ?? true) } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
  } as any;
}

function makeServices() {
  return {
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  } as any;
}

function mention(i: number) {
  return { authorId: `a${i}`, channelId: "c1", messageId: `m${i}`, ts: Math.floor(Date.now() / 1000) - 60 };
}

describe("afk mentions button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAfkMentions as any).mockResolvedValue([]);
  });

  it("ignores customIds it cannot parse", async () => {
    const interaction = makeInteraction("afk:mentions");

    await mentionsButton.run(makeServices(), interaction);

    expect(getAfkMentions).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it("ignores interactions without a guild", async () => {
    const interaction = makeInteraction(
      AfkMentionsId.build({ userId: USER_ID, page: "0" }),
      { guildId: null },
    );

    await mentionsButton.run(makeServices(), interaction);

    expect(getAfkMentions).not.toHaveBeenCalled();
  });

  it("rejects button presses from anyone but the original invoker", async () => {
    const interaction = makeInteraction(
      AfkMentionsId.build({ userId: USER_ID, page: "0" }),
      { userId: "999999999999999999" },
    );

    await expect(mentionsButton.run(makeServices(), interaction)).rejects.toBeInstanceOf(
      InteractionAccessDeniedError,
    );
  });

  it("renders the mentions page for the invoker", async () => {
    (getAfkMentions as any).mockResolvedValue([mention(1), mention(2)]);
    const interaction = makeInteraction(AfkMentionsId.build({ userId: USER_ID, page: "0" }));

    await mentionsButton.run(makeServices(), interaction);

    expect(getAfkMentions).toHaveBeenCalledWith(expect.anything(), "g1", USER_ID);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });

  it("clamps an out-of-range page to the last page", async () => {
    (getAfkMentions as any).mockResolvedValue([mention(1)]);
    const interaction = makeInteraction(AfkMentionsId.build({ userId: USER_ID, page: "9" }));

    await mentionsButton.run(makeServices(), interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });
});
