import { Utility } from "@sapphire/plugin-utilities-store";
import { RateLimitManager } from "@sapphire/ratelimits";

export class RateLimitUtility extends Utility {
  public constructor(context: Utility.Context, options: Utility.Options) {
    super(context, { ...options, name: "ratelimits" });
  }

  public createManager(time: number, limit: number = 1) {
    return new RateLimitManager(time, limit);
  }
}

declare module "@sapphire/plugin-utilities-store" {
  export interface Utilities {
    ratelimits: RateLimitUtility;
  }
}
