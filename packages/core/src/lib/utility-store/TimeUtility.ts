import { Utility } from "@sapphire/plugin-utilities-store";
import { Timestamp } from "@sapphire/timestamp";
import { Duration } from "@sapphire/time-utilities";

export class TimeUtility extends Utility {
  public constructor(context: Utility.Context, options: Utility.Options) {
    super(context, { ...options, name: "time" });
  }

  public relative(date: Date | number = new Date()): string {
    const t = new Timestamp("R");
    return t.display(date);
  }

  public shortTime(date: Date | number = new Date()): string {
    const t = new Timestamp("t");
    return t.display(date);
  }

  public formatDuration(ms: number): string {
    if (ms <= 0) return "0s";
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(" ");
  }

  public humanizeDelta(seconds: number): string {
    return this.formatDuration(seconds * 1000);
  }

  public parseDuration(input: string): number | null {
    const duration = new Duration(input).offset;
    return isNaN(duration) || duration <= 0
      ? null
      : Math.floor(duration / 1000);
  }
}

declare module "@sapphire/plugin-utilities-store" {
  export interface Utilities {
    time: TimeUtility;
  }
}
