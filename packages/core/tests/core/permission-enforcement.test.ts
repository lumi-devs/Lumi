import { describe, it, expect } from "bun:test";
import { asHandler, type CommandDef } from "#lib/commands/command-def.js";
import { banDef } from "#modules/mod/commands/ban.js";
import { kickDef } from "#modules/mod/commands/kick.js";
import { timeoutDef } from "#modules/mod/commands/timeout.js";
import { warnDef } from "#modules/mod/commands/warn.js";
import { softbanDef } from "#modules/mod/commands/softban.js";
import { quarantineDef } from "#modules/mod/commands/quarantine.js";
import { lockdownDef } from "#modules/mod/commands/lockdown.js";
import { lockDef } from "#modules/mod/commands/lock.js";
import { sayDef } from "#modules/mod/commands/say.js";
import { dmDef } from "#modules/mod/commands/dm.js";
import { notesDef } from "#modules/mod/commands/notes.js";
import { casesDef } from "#modules/mod/commands/cases.js";
import { sanitizeDef } from "#modules/mod/commands/sanitize.js";
import { vcmuteDef } from "#modules/mod/commands/vcmute.js";
import { lumiDef } from "#modules/core/commands/lumi.js";
import { repoDef } from "#modules/core/commands/repo.js";
import { downloadDef } from "#modules/core/commands/download.js";
import { helpDef } from "#modules/core/commands/help.js";
import { mydataDef } from "#modules/core/commands/mydata.js";

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

    it("repo carries no ambient Discord permission gate of its own", () => {
      expect(repoDef.defaultMemberPermissions).toBe(undefined);
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

  describe("shared gates", () => {
    it.each([...destructiveModCommands, ...adminCommands])(
      "$name declares a scoped permit",
      ({ def }) => {
        expect(def.requiredPermit).toMatch(/^(mod|admin)\./);
      },
    );
  });
});
