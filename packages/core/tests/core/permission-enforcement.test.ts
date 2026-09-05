import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import {
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js";
import { BanCommand } from "#modules/mod/commands/ban.js";
import { KickCommand } from "#modules/mod/commands/kick.js";
import { TimeoutCommand } from "#modules/mod/commands/timeout.js";
import { UntimeoutCommand } from "#modules/mod/commands/untimeout.js";
import { WarnCommand } from "#modules/mod/commands/warn.js";
import { SoftbanCommand } from "#modules/mod/commands/softban.js";
import { UnbanCommand } from "#modules/mod/commands/unban.js";
import { QuarantineCommand } from "#modules/mod/commands/quarantine.js";
import { UnquarantineCommand } from "#modules/mod/commands/unquarantine.js";
import { LockdownCommand } from "#modules/mod/commands/lockdown.js";
import { NotesCommand } from "#modules/mod/commands/notes.js";
import { CasesCommand } from "#modules/mod/commands/cases.js";
import { SanitizeCommand } from "#modules/mod/commands/sanitize.js";
import { VcMuteCommand } from "#modules/mod/commands/vcmute.js";
import { VcUnmuteCommand } from "#modules/mod/commands/vcunmute.js";
import { WarnThresholdsCommand } from "#modules/mod/commands/warnthresholds.js";
import { LumiCommand } from "#modules/core/commands/lumi.js";
import { DashboardCommand } from "#modules/core/commands/dashboard.js";
import { RepoCommand } from "#modules/core/commands/repo.js";
import { DownloadCommand } from "#modules/core/commands/download.js";
import { HelpCommand } from "#modules/core/commands/help.js";
import { MyDataCommand } from "#modules/core/commands/mydata.js";

const destructiveModCommands = [
  { name: "ban", Ctor: BanCommand, permit: "mod.*" },
  { name: "kick", Ctor: KickCommand, permit: "mod.*" },
  { name: "timeout", Ctor: TimeoutCommand, permit: "mod.*" },
  { name: "untimeout", Ctor: UntimeoutCommand, permit: "mod.*" },
  { name: "warn", Ctor: WarnCommand, permit: "mod.*" },
  { name: "softban", Ctor: SoftbanCommand, permit: "mod.softBan" },
  { name: "unban", Ctor: UnbanCommand, permit: "mod.*" },
  { name: "quarantine", Ctor: QuarantineCommand, permit: "mod.*" },
  { name: "unquarantine", Ctor: UnquarantineCommand, permit: "mod.*" },
  { name: "lockdown", Ctor: LockdownCommand, permit: "mod.lockdown" },
  { name: "notes", Ctor: NotesCommand, permit: "mod.notes" },
  { name: "cases", Ctor: CasesCommand, permit: "mod.*" },
  { name: "sanitize", Ctor: SanitizeCommand, permit: "mod.*" },
  { name: "vcmute", Ctor: VcMuteCommand, permit: "mod.voiceMute" },
  { name: "vcunmute", Ctor: VcUnmuteCommand, permit: "mod.voiceMute" },
];

const adminCommands = [
  { name: "warnthresholds", Ctor: WarnThresholdsCommand, permit: "admin.config" },
  { name: "lumi", Ctor: LumiCommand, permit: "admin.*" },
  { name: "dashboard", Ctor: DashboardCommand, permit: "admin.*" },
];

function construct(Ctor: any, name: string) {
  return new Ctor(
    {
      name,
      path: `/path/to/commands/${name}.ts`,
      root: "/path/to/commands",
      store: { name: "commands" } as any,
    },
    {},
  );
}

function collectPreconditionNames(entries: any[], into: string[]): void {
  for (const entry of entries) {
    if (Array.isArray(entry?.entries)) collectPreconditionNames(entry.entries, into);
    else if (typeof entry?.name === "string") into.push(entry.name);
  }
}

function preconditionNames(command: any): string[] {
  const names: string[] = [];
  collectPreconditionNames(command.preconditions.entries ?? [], names);
  return names;
}

describe("command permission enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    (container as any).client = { options: {} };
  });

  describe.each(destructiveModCommands)(
    "$name",
    ({ name, Ctor, permit }) => {
      it("declares the expected permit node", () => {
        expect(construct(Ctor, name).requiredPermit).toBe(permit);
      });

      it("carries the RequirePermit precondition", () => {
        expect(preconditionNames(construct(Ctor, name))).toContain(
          "RequirePermit",
        );
      });

      it("is gated behind ManageMessages for the Discord client", () => {
        expect(construct(Ctor, name).defaultMemberPermissions).toBe(
          PermissionFlagsBits.ManageMessages,
        );
      });

      it("is invocable only from inside a guild", () => {
        expect(construct(Ctor, name).contexts).toEqual([
          InteractionContextType.Guild,
        ]);
      });
    },
  );

  describe.each(adminCommands)("$name", ({ name, Ctor, permit }) => {
    it("declares the expected permit node", () => {
      expect(construct(Ctor, name).requiredPermit).toBe(permit);
    });

    it("carries the RequirePermit precondition", () => {
      expect(preconditionNames(construct(Ctor, name))).toContain(
        "RequirePermit",
      );
    });

    it("is gated behind ManageGuild for the Discord client", () => {
      expect(construct(Ctor, name).defaultMemberPermissions).toBe(
        PermissionFlagsBits.ManageGuild,
      );
    });

    it("is invocable only from inside a guild", () => {
      expect(construct(Ctor, name).contexts).toEqual([
        InteractionContextType.Guild,
      ]);
    });
  });

  describe("bot-owner commands", () => {
    it.each([
      { name: "repo", Ctor: RepoCommand },
      { name: "download", Ctor: DownloadCommand },
    ])("$name is gated by the BotOwner precondition", ({ name, Ctor }) => {
      expect(preconditionNames(construct(Ctor, name))).toContain("BotOwner");
    });

    it("repo carries no ambient Discord permission gate of its own", () => {
      expect(construct(RepoCommand, "repo").defaultMemberPermissions).toBe(
        undefined,
      );
    });
  });

  describe("unprivileged commands", () => {
    it.each([
      { name: "mydata", Ctor: MyDataCommand },
      { name: "help", Ctor: HelpCommand },
    ])("$name requires no permit", ({ name, Ctor }) => {
      const command = construct(Ctor, name);
      expect(command.requiredPermit).toBeUndefined();
      expect(preconditionNames(command)).not.toContain("RequirePermit");
    });

    it.each([
      { name: "mydata", Ctor: MyDataCommand },
      { name: "help", Ctor: HelpCommand },
    ])("$name stays usable outside a guild", ({ name, Ctor }) => {
      expect(construct(Ctor, name).contexts).toEqual([
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ]);
    });
  });

  describe("shared gates", () => {
    it.each([...destructiveModCommands, ...adminCommands])(
      "$name runs behind the maintenance and module gates",
      ({ name, Ctor }) => {
        const names = preconditionNames(construct(Ctor, name));
        expect(names).toContain("MaintenanceMode");
        expect(names).toContain("ModuleEnabled");
      },
    );

    it("every destructive mod command declares a mod-scoped permit", () => {
      for (const { name, Ctor } of destructiveModCommands) {
        expect(construct(Ctor, name).requiredPermit).toMatch(/^mod\./);
      }
    });
  });
});
