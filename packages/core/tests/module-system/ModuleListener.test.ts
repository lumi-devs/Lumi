import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { EventEmitter } from "node:events";

import {
  addListenerDef,
  defineListener,
} from "@lumi/lib/listeners/listener-def.js";
import { attachDefs } from "@lumi/lib/listeners/listener-loader.js";
import type { Container } from "@lumi/lib/services.js";

const isModuleEnabled = vi.fn();
const services = {
  db: { modules: { isModuleEnabled } },
} as unknown as Container;

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("listener-loader module gating", () => {
  beforeEach(() => {
    isModuleEnabled.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not run a module-gated def when the module is disabled", async () => {
    isModuleEnabled.mockResolvedValue(false);
    const execute = vi.fn();
    const def = defineListener({
      name: "gate-disabled",
      event: "test:gate-disabled",
      module: "mod",
      execute,
    });
    addListenerDef(def);

    const emitter = new EventEmitter();
    const detach = attachDefs(services, emitter as never, [def]);
    emitter.emit("test:gate-disabled", { guildId: "g-1" });
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(isModuleEnabled).toHaveBeenCalledWith("g-1", "mod");
    detach();
  });

  it("runs a module-gated def with event args when the module is enabled", async () => {
    const execute = vi.fn();
    const def = defineListener({
      name: "gate-enabled",
      event: "test:gate-enabled",
      module: "mod",
      execute,
    });
    addListenerDef(def);

    const emitter = new EventEmitter();
    const detach = attachDefs(services, emitter as never, [def]);
    const payload = { guildId: "g-2" };
    emitter.emit("test:gate-enabled", payload);
    await flush();

    expect(execute).toHaveBeenCalledWith(services, payload);
    detach();
  });

  it("runs an un-gated def even without a guild id", async () => {
    const execute = vi.fn();
    const def = defineListener({
      name: "no-gate",
      event: "test:no-gate",
      execute,
    });
    addListenerDef(def);

    const emitter = new EventEmitter();
    const detach = attachDefs(services, emitter as never, [def]);
    emitter.emit("test:no-gate", {});
    await flush();

    expect(execute).toHaveBeenCalled();
    detach();
  });
});
