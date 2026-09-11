import { describe, it, expect } from "bun:test";
import { ChannelType } from "discord.js";
import { s } from "@sapphire/shapeshift";
import {
  cfg,
  fieldsFromSchema,
  toStringArray,
  validateModuleConfigValue,
  snowflakeString,
  durationString,
  choiceEnum,
  FieldType,
} from "#lib/module-system/config-schema.js";

describe("Config Schema Utilities", () => {
  describe("cfg builders & fieldsFromSchema", () => {
    it("creates a schema with all field types and extracts field metadata", () => {
      const schema = cfg.object({
        enabled: cfg.boolean({ label: "Enable Feature", description: "Toggle on/off", default: true }),
        maxLimit: cfg.number({ label: "Max Limit", description: "Upper limit", min: 1, max: 100, default: 50 }),
        greeting: cfg.string({ label: "Greeting", description: "Welcome msg", default: "Hello" }),
        mode: cfg.enum(["easy", "hard"] as const, { label: "Mode", description: "Difficulty", default: "easy" }),
        logChannel: cfg.channel({
          label: "Log Channel",
          description: "Target channel",
          channelTypes: [ChannelType.GuildText],
        }),
        modRole: cfg.role({ label: "Mod Role", description: "Staff role" }),
        adminUser: cfg.user({ label: "Admin User", description: "Owner user" }),
      });

      // Test validation of valid shape
      const validData = {
        enabled: true,
        maxLimit: 10,
        greeting: "Hi there",
        mode: "hard",
        logChannel: "123456789012345678",
        modRole: "987654321098765432",
        adminUser: "112233445566778899",
      };
      expect(schema.parse(validData)).toEqual(validData);

      // Extract metadata
      const fields = fieldsFromSchema(schema);
      expect(fields).toHaveLength(7);

      expect(fields.find((f) => f.key === "enabled")).toEqual({
        key: "enabled",
        type: FieldType.Boolean,
        label: "Enable Feature",
        description: "Toggle on/off",
        default: true,
        required: undefined,
      });

      expect(fields.find((f) => f.key === "maxLimit")).toEqual({
        key: "maxLimit",
        type: FieldType.Number,
        label: "Max Limit",
        description: "Upper limit",
        default: 50,
        min: 1,
        max: 100,
        required: undefined,
      });

      expect(fields.find((f) => f.key === "logChannel")).toEqual({
        key: "logChannel",
        type: FieldType.Channel,
        label: "Log Channel",
        description: "Target channel",
        default: undefined,
        required: undefined,
        channelTypes: [ChannelType.GuildText],
      });

      expect(fields.find((f) => f.key === "mode")).toEqual({
        key: "mode",
        type: FieldType.Enum,
        label: "Mode",
        description: "Difficulty",
        default: "easy",
        required: undefined,
        choices: ["easy", "hard"],
      });
    });

    it("enforces validation rules on number min/max and snowflake fields", () => {
      const numSchema = cfg.number({ label: "Range", description: "1-10", min: 1, max: 10 });
      expect(() => numSchema.parse(0)).toThrow();
      expect(() => numSchema.parse(11)).toThrow();
      expect(numSchema.parse(5)).toBe(5);

      const userSchema = cfg.user({ label: "User", description: "Discord User" });
      expect(() => userSchema.parse("invalid-snowflake")).toThrow();
      expect(() => userSchema.parse("123")).toThrow(); // too short (< 17)
      expect(userSchema.parse("123456789012345678")).toBe("123456789012345678");
    });

    it("throws on a dangling enabledBy reference", () => {
      const schema = cfg.object({
        detail: cfg.string({ label: "Detail", description: "x", enabledBy: "missing" }),
      });
      expect(() => fieldsFromSchema(schema)).toThrow(/enabledBy/);
    });

    it("throws when enabledBy points at a non-boolean field", () => {
      const schema = cfg.object({
        limit: cfg.number({ label: "Limit", description: "x" }),
        detail: cfg.string({ label: "Detail", description: "x", enabledBy: "limit" }),
      });
      expect(() => fieldsFromSchema(schema)).toThrow(/BOOLEAN/);
    });

    it("throws on a dangling pairedWith reference", () => {
      const schema = cfg.object({
        toggle: cfg.boolean({ label: "Toggle", description: "x", pairedWith: "missing" }),
      });
      expect(() => fieldsFromSchema(schema)).toThrow(/pairedWith/);
    });

    it("handles schemas without shape or containing untagged fields in fieldsFromSchema", () => {
      // Schema without shape
      const primitiveSchema = s.string() as any;
      expect(fieldsFromSchema(primitiveSchema)).toEqual([]);

      // Schema with untagged fields
      const mixedSchema = s.object({
        tagged: cfg.boolean({ label: "Tagged", description: "Tagged field" }),
        untagged: s.string(),
      }) as any;

      const fields = fieldsFromSchema(mixedSchema);
      expect(fields).toHaveLength(1);
      expect(fields[0]!.key).toBe("tagged");
    });
  });

  describe("toStringArray", () => {
    it("returns string arrays untouched (filtering non-strings)", () => {
      expect(toStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
      expect(toStringArray(["a", 123, null, "b"])).toEqual(["a", "b"]);
    });

    it("returns an empty array for strings, null, undefined, or other values", () => {
      expect(toStringArray("apple, banana , cherry")).toEqual([]);
      expect(toStringArray(null)).toEqual([]);
      expect(toStringArray(undefined)).toEqual([]);
      expect(toStringArray(12345)).toEqual([]);
      expect(toStringArray({ foo: "bar" })).toEqual([]);
    });
  });

  describe("Helper Schema Validators", () => {
    it("validates snowflakeString", () => {
      const validator = snowflakeString();
      expect(validator.parse("123456789012345678")).toBe("123456789012345678");
      expect(() => validator.parse("short")).toThrow();
    });

    it("validates durationString", () => {
      const validator = durationString();
      expect(validator.parse("10s")).toBe("10s");
      expect(validator.parse("5m")).toBe("5m");
      expect(validator.parse("2h")).toBe("2h");
      expect(validator.parse("1d")).toBe("1d");

      expect(() => validator.parse("10x")).toThrow();
      expect(() => validator.parse("abc")).toThrow();
      expect(() => validator.parse("10")).toThrow();
    });

    it("validates choiceEnum", () => {
      const validator = choiceEnum(["red", "green", "blue"] as const);
      expect(validator.parse("green")).toBe("green");
      expect(() => validator.parse("yellow")).toThrow();
    });

    it("validates config values using validateModuleConfigValue", () => {
      const schema = cfg.object({
        limit: cfg.number({ label: "Limit", description: "Limit value", min: 1, max: 10 }),
        mode: cfg.enum(["a", "b"] as const, { label: "Mode", description: "Mode value" }),
      });

      expect(validateModuleConfigValue(schema, "limit", 5)).toBe(5);
      expect(() => validateModuleConfigValue(schema, "limit", 20)).toThrow();
      expect(validateModuleConfigValue(schema, "mode", "a")).toBe("a");
      expect(() => validateModuleConfigValue(schema, "mode", "c")).toThrow();
      // Undeclared keys pass through unchecked
      expect(validateModuleConfigValue(schema, "unknownKey", "anything")).toBe("anything");
    });
  });

  describe("duration, multi snowflake & slider fields", () => {
    it("validates cfg.duration values against the duration pattern", () => {
      const schema = cfg.duration({ label: "Cooldown", description: "Wait time" });
      for (const v of ["30s", "10m", "2h", "7d"]) expect(schema.parse(v)).toBe(v);
      for (const v of ["10x", "abc", "10", "", "m", "1.5h"]) {
        expect(() => schema.parse(v)).toThrow();
      }
    });

    it("exposes duration meta via fieldsFromSchema", () => {
      const schema = cfg.object({
        cooldown: cfg.duration({
          label: "Cooldown",
          description: "Wait time",
          default: "15m",
          group: "Limits",
          quickPicks: ["5m", "15m", "1h", "24h", "7d"],
        }),
      });
      expect(fieldsFromSchema(schema)).toEqual([
        {
          key: "cooldown",
          type: FieldType.Duration,
          label: "Cooldown",
          description: "Wait time",
          default: "15m",
          required: undefined,
          group: "Limits",
          quickPicks: ["5m", "15m", "1h", "24h", "7d"],
        },
      ]);
      expect(validateModuleConfigValue(schema, "cooldown", "1h")).toBe("1h");
      expect(() => validateModuleConfigValue(schema, "cooldown", "nope")).toThrow();
    });

    it("validates cfg.multiRole/cfg.multiChannel/cfg.multiUser snowflake arrays", () => {
      const roles = cfg.multiRole({ label: "Roles", description: "Role list" });
      const channels = cfg.multiChannel({
        label: "Channels",
        description: "Channel list",
        channelTypes: [ChannelType.GuildText],
      });
      const users = cfg.multiUser({ label: "Users", description: "User list" });
      const ids = ["123456789012345678", "987654321098765432"];
      expect(roles.parse(ids)).toEqual(ids);
      expect(channels.parse(ids)).toEqual(ids);
      expect(users.parse(ids)).toEqual(ids);
      expect(roles.parse([])).toEqual([]);
      expect(users.parse([])).toEqual([]);
      expect(() => roles.parse(["short"])).toThrow();
      expect(() => users.parse(["short"])).toThrow();
      expect(() => roles.parse(["123456789012345678", "nope"])).toThrow();
      expect(() => channels.parse("123456789012345678")).toThrow();
      expect(() => users.parse("123456789012345678")).toThrow();
    });

    it("validates cfg.stringList free-text arrays", () => {
      const terms = cfg.stringList({ label: "Terms", description: "Term list" });
      expect(terms.parse(["badword", "spam phrase"])).toEqual(["badword", "spam phrase"]);
      expect(terms.parse([])).toEqual([]);
      expect(() => terms.parse("badword")).toThrow();
      expect(() => terms.parse([123])).toThrow();
    });

    it("exposes multi snowflake meta via fieldsFromSchema", () => {
      const schema = cfg.object({
        staffRoles: cfg.multiRole({
          label: "Staff Roles",
          description: "Staff list",
          default: ["123456789012345678"],
        }),
        logChannels: cfg.multiChannel({ label: "Log Channels", description: "Log list" }),
        watchUsers: cfg.multiUser({ label: "Watch Users", description: "User list" }),
        badTerms: cfg.stringList({ label: "Bad Terms", description: "Term list" }),
      });
      const fields = fieldsFromSchema(schema);
      expect(fields.find((f) => f.key === "staffRoles")).toEqual({
        key: "staffRoles",
        type: FieldType.MultiRole,
        label: "Staff Roles",
        description: "Staff list",
        default: ["123456789012345678"],
        required: undefined,
      });
      expect(fields.find((f) => f.key === "logChannels")?.type).toBe(
        FieldType.MultiChannel,
      );
      expect(fields.find((f) => f.key === "watchUsers")?.type).toBe(
        FieldType.MultiUser,
      );
      expect(fields.find((f) => f.key === "badTerms")?.type).toBe(
        FieldType.StringList,
      );
    });

    it("passes number step through to field meta", () => {
      const schema = cfg.object({
        volume: cfg.number({ label: "Volume", description: "Level", step: 5, default: 50 }),
        plain: cfg.number({ label: "Plain", description: "No slider" }),
      });
      const fields = fieldsFromSchema(schema);
      expect(fields.find((f) => f.key === "volume")?.step).toBe(5);
      expect(fields.find((f) => f.key === "plain")?.step).toBeUndefined();
      expect(validateModuleConfigValue(schema, "volume", 25)).toBe(25);
    });

    it("exposes cfg.objectArray entries with subfield meta and validates rows", () => {
      const schema = cfg.object({
        entries: cfg.objectArray(
          {
            channel_id: cfg.channel({ label: "Channel", description: "Target" }),
            message: cfg.string({ label: "Message", description: "Text" }),
            enabled: cfg.boolean({ label: "Enabled", description: "On/off", default: true }),
          },
          { label: "Entries", description: "List", default: [] },
        ),
      });
      const [field] = fieldsFromSchema(schema);
      expect(field?.type).toBe(FieldType.ObjectArray);
      expect(field?.subfields?.map((s) => [s.key, s.type])).toEqual([
        ["channel_id", FieldType.Channel],
        ["message", FieldType.String],
        ["enabled", FieldType.Boolean],
      ]);
      const rows = [
        { channel_id: "123456789012345678", message: "hi", enabled: true },
      ];
      expect(validateModuleConfigValue(schema, "entries", rows)).toEqual(rows);
      expect(validateModuleConfigValue(schema, "entries", [])).toEqual([]);
      expect(() =>
        validateModuleConfigValue(schema, "entries", [
          { channel_id: "short", message: "hi", enabled: true },
        ]),
      ).toThrow();
      expect(() =>
        cfg.objectArray({ bad: "nope" } as any, { label: "X", description: "Y" }),
      ).toThrow();
    });
  });
});
