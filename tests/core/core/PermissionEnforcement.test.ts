import { describe, it, expect } from "bun:test";
import { PermissionFlagsBits } from "discord.js";
import { asHandler, type CommandDef } from "#src/lib/commands/CommandDef.js";
import { finalizeBuilder } from "#src/lib/commands/CommandDispatch.js";
import { banDef } from "#src/modules/mod/commands/Ban.js";
import { kickDef } from "#src/modules/mod/commands/Kick.js";
import { timeoutDef } from "#src/modules/mod/commands/Timeout.js";
import { warnDef } from "#src/modules/mod/commands/Warn.js";
import { softbanDef } from "#src/modules/mod/commands/Softban.js";
import { quarantineDef } from "#src/modules/mod/commands/Quarantine.js";
import { lockdownDef } from "#src/modules/mod/commands/Lockdown.js";
import { lockDef } from "#src/modules/mod/commands/Lock.js";
import { sayDef } from "#src/modules/mod/commands/Say.js";
import { dmDef } from "#src/modules/mod/commands/Dm.js";
import { notesDef } from "#src/modules/mod/commands/Notes.js";
import { casesDef } from "#src/modules/mod/commands/Cases.js";
import { sanitizeDef } from "#src/modules/mod/commands/Sanitize.js";
import { vcmuteDef } from "#src/modules/mod/commands/Vcmute.js";
import { lumiDef } from "#src/modules/onboarding/commands/Lumi.js";
import { repoDef } from "#src/admin/commands/Repo.js";
import { downloadDef } from "#src/admin/commands/Download.js";
import { helpDef } from "#src/modules/onboarding/commands/Help.js";
import { mydataDef } from "#src/modules/onboarding/commands/Mydata.js";

const destructiveModCommands: { name: string; def: CommandDef; permit: string }[] = [
  { name: "ban", def: banDef, permit: "mod.*" },
  { name: "kick", def: kickDef, permit: "mod.*" },
  { name: "timeout", def: timeoutDef, permit: "mod.*" },
  { name: "warn", def: warnDef, permit: "mod.*" },
  { name: "softban", def: softbanDef, permit: "mod.softBan" },
  { name: "quarantine", def: quarantineDef, permit: "mod.*" },
  { name: "lockdown", def: lockdownDef, permit: "mod.lockdown" },
  { name: "lock", def: lockDef, permit: "mod.lockdown" },
  { name: "say", def: sayDef, permit: "mod.say" },
  { name: "dm", def: dmDef, permit: "mod.dm" },
  { name: "notes", def: notesDef, permit: "mod.notes" },
  { name: "cases", def: casesDef, permit: "mod.*" },
  { name: "sanitize", def: sanitizeDef, permit: "mod.*" },
  { name: "vcmute", def: vcmuteDef, permit: "mod.voiceMute" },
];

const adminCommands: { name: string; def: CommandDef; permit: string }[] = [
  { name: "lumi", def: lumiDef, permit: "admin.*" },
];

describe("command permission enforcement", () => {
  describe.each(destructiveModCommands)("$name", ({ def, permit }) => {
    it("declares the expected permit node", () => {
      expect(def.requiredPermit).toBe(permit);
    });

    it("denies callers without the permit", () => {
      expect(def.requiredPermit).toBeDefined();
    });

    it("is invocable only from inside a guild", () => {
      expect(def.guildOnly).toBe(true);
    });
  });

  describe.each(adminCommands)("$name", ({ def, permit }) => {
    it("declares the expected permit node", () => {
      expect(def.requiredPermit).toBe(permit);
    });

    it("denies callers without the permit", () => {
      expect(def.requiredPermit).toBeDefined();
    });

    it("is invocable only from inside a guild", () => {
      expect(def.guildOnly).toBe(true);
    });
  });

  describe("per-subcommand permits", () => {
    function entryPermits(def: CommandDef): Record<string, string | undefined> {
      const out: Record<string, string | undefined> = {};
      for (const [key, handler] of Object.entries(def.handlers ?? {})) {
        out[key] = asHandler(handler).requiredPermit;
      }
      return out;
    }

    it("ban add/remove carry granular permit gates", () => {
      expect(entryPermits(banDef)).toEqual({
        add: "mod.ban",
        remove: "mod.unban",
      });
    });

    it("cases entries share the mod.cases gate", () => {
      expect(entryPermits(casesDef)).toEqual({
        view: "mod.cases",
        modify: "mod.cases",
        delete: "mod.cases",
      });
    });
  });

  describe("bot-owner commands", () => {
    it.each([
      { name: "repo", def: repoDef },
      { name: "download", def: downloadDef },
    ])("$name is gated by the botOwner flag", ({ def }) => {
      expect(def.botOwner).toBe(true);
    });

    it("repo derives Administrator from its botOwner flag", () => {
      const payload = finalizeBuilder(repoDef).toJSON() as unknown as Record<string, unknown>;
      expect(payload["default_member_permissions"] ?? null).toBe(
        String(PermissionFlagsBits.Administrator),
      );
    });
  });

  describe("unprivileged commands", () => {
    it.each([
      { name: "mydata", def: mydataDef },
      { name: "help", def: helpDef },
    ])("$name requires no permit", ({ def }) => {
      expect(def.requiredPermit).toBeUndefined();
      expect(def.botOwner).toBeFalsy();
    });

    it.each([
      { name: "mydata", def: mydataDef },
      { name: "help", def: helpDef },
    ])("$name stays usable outside a guild", ({ def }) => {
      expect(def.guildOnly).toBeFalsy();
    });
  });

  describe("derived member permissions", () => {
    const dmpOf = (def: CommandDef): unknown =>
      (finalizeBuilder(def).toJSON() as unknown as Record<string, unknown>)[
        "default_member_permissions"
      ] ?? null;

    it("derives Administrator for admin.* nodes", () => {
      expect(dmpOf({ ...mydataDef, requiredPermit: "admin.config" })).toBe(
        String(PermissionFlagsBits.Administrator),
      );
    });

    it("derives ManageGuild for other nodes", () => {
      expect(dmpOf({ ...mydataDef, requiredPermit: "mod.ban" })).toBe(
        String(PermissionFlagsBits.ManageGuild),
      );
    });

    it("derives Administrator for owner-only commands", () => {
      expect(dmpOf({ ...mydataDef, botOwner: true })).toBe(
        String(PermissionFlagsBits.Administrator),
      );
      expect(dmpOf({ ...mydataDef, guildOwner: true })).toBe(
        String(PermissionFlagsBits.Administrator),
      );
    });

    it("derives no restriction without a gate", () => {
      expect(dmpOf(mydataDef)).toBeNull();
    });
  });

  describe("shared gates", () => {
    it.each([...destructiveModCommands, ...adminCommands])(
      "$name declares a scoped permit",
      ({ def }) => {
        expect(def.requiredPermit).toMatch(/^(mod|admin)\./);
      },
    );
  });
});
