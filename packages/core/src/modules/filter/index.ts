import { Module, EmberModule, cfg } from "#core/module-system/Module.js";
import {
  registerWorkerHandler,
  unregisterWorkerHandler,
} from "#workers/registry.js";
import type { FilterService } from "./services/FilterService.js";

const FILTER_WORKER_ACTION = "FILTER";
const FILTER_WORKER_PATH = new URL("./workers/aho-corasick.ts", import.meta.url)
  .href;

@EmberModule({
  name: "filter",
  displayName: "Filter",
  emoji: "🚫",
  version: "1.0.0",
  description:
    "Aho-Corasick word filter — O(n+m) pattern matching per message.",
  configSchema: cfg.object({
    terms: cfg.string({
      label: "Filtered Terms",
      description: "Comma-separated list of words/phrases to block.",
      list: true,
    }),
  }),
})
export class FilterModule extends Module {
  public override onLoad() {
    registerWorkerHandler(FILTER_WORKER_ACTION, FILTER_WORKER_PATH);
    this.container.configChangeHooks.set(
      "filter:terms",
      async (guildId, _key) => {
        const svc = this.container.stores.get("services").get("filter") as
          | FilterService
          | undefined;
        await svc?.loadGuild(guildId);
      },
    );
    return super.onLoad();
  }

  public override onUnload() {
    unregisterWorkerHandler(FILTER_WORKER_ACTION);
    this.container.configChangeHooks.delete("filter:terms");
    return super.onUnload();
  }
}
