import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type CommandDefinition, defineModule, type ListenerDefinition } from "../src/index.js";

describe("Module Kit", () => {
  describe("defineModule", () => {
    it("should create valid module definition", () => {
      const mod = defineModule({
        name: "test-module",
        displayName: "Test Module",
        emoji: "🧪",
        description: "A test module",
        version: "1.0.0",
        config: z.object({
          setting1: z.string().default("default"),
          setting2: z.number().int().min(0).default(10),
        }, {}),
        commands: [],
        listeners: [],
        tasks: [],
        async onLoad(_services) { return []; },
        async onUnload(_services) {},
      });
      
      expect(mod.name).toBe("test-module");
      expect(mod.displayName).toBe("Test Module");
      expect(mod.emoji).toBe("🧪");
      expect(mod.version).toBe("1.0.0");
      expect(mod.config).toBeDefined();
      expect(mod.commands).toEqual([]);
      expect(mod.listeners).toEqual([]);
    });
    
    it("should infer config type from Zod schema", () => {
      const mod = defineModule({
        name: "typed-module",
        displayName: "Typed Module",
        emoji: "📝",
        description: "Module with typed config",
        version: "1.0.0",
        config: z.object({
          stringSetting: z.string().default("value"),
          numberSetting: z.number().int().min(0).max(100).default(50),
          booleanSetting: z.boolean().default(true),
          arraySetting: z.array(z.string(), {}).default([]),
          objectSetting: z.object({ key: z.string() }).optional(),
        }, {}),
        commands: [],
        listeners: [],
        tasks: [],
        async onLoad(_services) { return []; },
        async onUnload(_services) {},
      });
      
      // Type inference test - if this compiles, types are correct
      const config = mod.config.parse({
        stringSetting: "test",
        numberSetting: 42,
        booleanSetting: false,
        arraySetting: ["a", "b"],
        objectSetting: { key: "value" },
      });
      
      expect(config.stringSetting).toBe("test");
      expect(config.numberSetting).toBe(42);
      expect(config.booleanSetting).toBe(false);
      expect(config.arraySetting).toEqual(["a", "b"]);
      expect(config.objectSetting).toEqual({ key: "value" });
    });
    
    it("should apply defaults for missing config", () => {
      const mod = defineModule({
        name: "defaults-module",
        displayName: "Defaults Module",
        emoji: "⚙️",
        description: "Module with defaults",
        version: "1.0.0",
        config: z.object({
          withDefault: z.string().default("default-value"),
          withoutDefault: z.string().optional(),
        }, {}),
        commands: [],
        listeners: [],
        tasks: [],
        async onLoad(_services) { return []; },
        async onUnload(_services) {},
      });
      
      const config = mod.config.parse({});
      expect(config.withDefault).toBe("default-value");
      expect(config.withoutDefault).toBeUndefined();
    });
  });
  
  describe("CommandDefinition", () => {
    it("should accept valid command definition", () => {
      const cmd: CommandDefinition = {
        data: { name: "test" } as any,
        requiredPermit: "test.cmd",
        async execute(_interaction, _services) {},
      };
      
      expect(cmd.data.name).toBe("test");
      expect(cmd.requiredPermit).toBe("test.cmd");
    });
  });
  
  describe("ListenerDefinition", () => {
    it("should accept valid listener definition", () => {
      const listener: ListenerDefinition = {
        event: "MessageCreate",
        handler: async (_message, _services) => {},
      };
      
      expect(listener.event).toBe("MessageCreate");
    });
  });
});