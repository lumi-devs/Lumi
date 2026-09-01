import { describe, it, expect } from "vitest";
import { ChannelType } from "discord.js";
import { s } from "@sapphire/shapeshift";
import {
  cfg,
  fieldsFromSchema,
  parseConfigList,
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
        greeting: cfg.string({ label: "Greeting", description: "Welcome msg", list: false, default: "Hello" }),
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
        type: FieldType.BOOLEAN,
        label: "Enable Feature",
        description: "Toggle on/off",
        default: true,
        required: undefined,
      });

      expect(fields.find((f) => f.key === "maxLimit")).toEqual({
        key: "maxLimit",
        type: FieldType.NUMBER,
        label: "Max Limit",
        description: "Upper limit",
        default: 50,
        required: undefined,
      });

      expect(fields.find((f) => f.key === "logChannel")).toEqual({
        key: "logChannel",
        type: FieldType.CHANNEL,
        label: "Log Channel",
        description: "Target channel",
        default: undefined,
        required: undefined,
        channelTypes: [ChannelType.GuildText],
      });

      expect(fields.find((f) => f.key === "mode")).toEqual({
        key: "mode",
        type: FieldType.ENUM,
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

  describe("parseConfigList", () => {
    it("returns string arrays untouched (filtering non-strings)", () => {
      expect(parseConfigList(["a", "b", "c"])).toEqual(["a", "b", "c"]);
      expect(parseConfigList(["a", 123, null, "b"])).toEqual(["a", "b"]);
    });

    it("splits comma-separated strings and trims whitespace", () => {
      expect(parseConfigList("apple, banana , cherry")).toEqual(["apple", "banana", "cherry"]);
      expect(parseConfigList("  one, , two ,")).toEqual(["one", "two"]);
    });

    it("returns an empty array for null, undefined, or non-string/array values", () => {
      expect(parseConfigList(null)).toEqual([]);
      expect(parseConfigList(undefined)).toEqual([]);
      expect(parseConfigList(12345)).toEqual([]);
      expect(parseConfigList({ foo: "bar" })).toEqual([]);
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
});
