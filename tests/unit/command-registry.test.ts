import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  type RegisteredCommand,
} from "../../src/core/modules.ts";

function command(
  name: string,
  aliases: string[] = [],
  module: string | null = "demo",
): RegisteredCommand {
  return {
    data: { name, toJSON: () => ({ name }) },
    execute: async () => {},
    aliases,
    module,
  } as unknown as RegisteredCommand;
}

describe("CommandRegistry", () => {
  it("registers commands and their aliases", () => {
    const registry = new CommandRegistry();

    expect(registry.add(command("ping", ["p"]))).toBe(true);
    expect(registry.get("ping")?.data.name).toBe("ping");
    expect(registry.get("PING")?.data.name).toBe("ping");
    expect(registry.get("p")?.data.name).toBe("ping");
    expect(registry.size).toBe(1);
    expect(registry.aliasCount).toBe(1);
  });

  it("ignores duplicate command names", () => {
    const registry = new CommandRegistry();

    registry.add(command("ping", [], "first"));
    expect(registry.add(command("ping", [], "second"))).toBe(false);
    expect(registry.get("ping")?.module).toBe("first");
  });

  it("skips aliases that collide with commands or other aliases", () => {
    const registry = new CommandRegistry();

    registry.add(command("ping", ["p"]));
    registry.add(command("pong", ["p", "ping"]));

    expect(registry.get("p")?.data.name).toBe("ping");
    expect(registry.get("ping")?.data.name).toBe("ping");
    expect(registry.aliasCount).toBe(1);
  });

  it("removes the commands and aliases of one module", () => {
    const registry = new CommandRegistry();

    registry.add(command("ping", ["p"], "demo"));
    registry.add(command("help", ["h"], "other"));

    registry.removeModule("demo");

    expect(registry.get("ping")).toBeUndefined();
    expect(registry.get("p")).toBeUndefined();
    expect(registry.get("help")?.data.name).toBe("help");
    expect(registry.size).toBe(1);
  });

  it("serialises registered commands as a slash payload", () => {
    const registry = new CommandRegistry();

    registry.add(command("ping"));
    registry.add(command("help"));

    expect(registry.payload()).toEqual([{ name: "ping" }, { name: "help" }]);
  });
});
