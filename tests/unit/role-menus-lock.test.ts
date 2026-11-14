import type { ModuleServices } from "@lumi/module-kit";
import type { Guild, GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { applyRoleSelection } from "../../modules/role-menus/menu/service.js";
import type {
  MenuGroup,
  MenuOption,
} from "../../modules/role-menus/menu/ui.js";
import { tryWithLock } from "../../modules/shared/lock.js";

const services = {
  helpers: { cache: { distributed: false } },
} as unknown as ModuleServices;

const group = { id: "group-1", guildId: "guild-1" } as MenuGroup;
const member = { id: "user-1" } as GuildMember;
const guild = { id: "guild-1" } as Guild;
const options: readonly MenuOption[] = [];

describe("role menu selection locking", () => {
  it("refuses a concurrent selection for the same member and group", async () => {
    let release: (() => void) | undefined;
    const held = tryWithLock(
      services,
      "role-menu:guild-1:user-1:group-1",
      15_000,
      async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    );

    const result = await applyRoleSelection(
      services,
      guild,
      member,
      group,
      options,
      [],
    );

    expect(result).toEqual({
      ok: false,
      message:
        "Another role change is already in progress. Try again in a moment.",
    });
    release?.();
    await held;
  });
});
