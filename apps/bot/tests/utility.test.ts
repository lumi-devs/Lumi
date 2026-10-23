import { describe, expect, it } from "bun:test";
import utilityModule from "@modules/utility/index.ts";

describe("utility module", () => {
  it("defines standard utility commands", () => {
    expect(utilityModule.name).toBe("utility");
    const cmdNames = (utilityModule.commands ?? []).map((c) => c.name).sort();
    expect(cmdNames).toEqual([
      "avatar",
      "banner",
      "nick",
      "purge",
      "serverinfo",
      "whois",
    ]);
  });

  it("assigns permit nodes to moderation utilities", () => {
    const purge = utilityModule.commands?.find((c) => c.name === "purge");
    expect(purge?.permitNode).toBe("utility.purge");

    const nick = utilityModule.commands?.find((c) => c.name === "nick");
    expect(nick?.permitNode).toBe("utility.nick");
  });
});
