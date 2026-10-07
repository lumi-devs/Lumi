import { describe, it, expect, vi, beforeEach, afterEach } from "bun:test";
import { EventEmitter } from "node:events";
import * as misc from "#lib/utilities/misc.js";

import {
  addListenerDef,
  defineListener,
} from "#lib/listeners/listener-def.js";
import { attachDefs } from "#lib/listeners/listener-loader.js";
import type { Container } from "#lib/services.js";

const services = {} as unknown as Container;

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("listener-loader module gating", () => {
  let isModuleEnabled: ReturnType<
    typeof vi.spyOn<typeof misc, "isModuleEnabled">
  >;

  beforeEach(() => {
    isModuleEnabled = vi
      .spyOn(misc, "isModuleEnabled")
      .mockResolvedValue(true);
  });

  // Spies mutate the shared module object: restore the real implementation
  // so later test files see real misc.js behavior.
  afterEach(() => {
    isModuleEnabled.mockRestore();
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
    expect(isModuleEnabled).toHaveBeenCalledWith(services, "g-1", "mod");
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
