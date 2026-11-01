import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { quoteCommand } from "./commands.js";
import { QuoteConfigSchema } from "./config.js";
import { QuoteModuleName } from "./constants.js";
import { quoteRemoveListener } from "./service.js";

const quoteModule: ModuleDefinition = defineModule({
  name: QuoteModuleName,
  displayName: "Quotes",
  emoji: "💬",
  description: 'Turn messages and text into "Make it a Quote" images',
  version: "1.0.0",
  config: QuoteConfigSchema,
  commands: [quoteCommand],
  listeners: [quoteRemoveListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[quote] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[quote] Module unloaded");
  },
});

export default quoteModule;
