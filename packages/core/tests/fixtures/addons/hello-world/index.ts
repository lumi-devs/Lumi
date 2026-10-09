import { cfg, defineModule } from "lumi";

export const meta = defineModule({
  name: "hello-world",
  displayName: "Hello World",
  emoji: "👋",
  version: "1.0.0",
  description: "The simplest possible Lumi addon.",
  configSchema: cfg.object({
    greeting: cfg.string({
      label: "Greeting",
      description: "The message /hello replies with.",
      default: "Hello from Lumi!",
    }),
  }),
});
