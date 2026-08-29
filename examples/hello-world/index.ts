import { cfg, DefineModule, Module } from "lumi";

@DefineModule({
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
})
export class HelloWorldModule extends Module {
  public override async deleteUserData(): Promise<void> {
    // No-op: this addon stores no data keyed by a user ID.
  }
}
