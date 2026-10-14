import { RateLimitManager } from "@sapphire/ratelimits";

export interface AntiSpamInterval {
  windowMs: number;
  limit: number;
}

export class AntiSpam {
  private readonly managers: RateLimitManager[];

  public constructor(
    _services: any,
    _key: string,
    intervals: AntiSpamInterval | AntiSpamInterval[],
  ) {
    const list = Array.isArray(intervals) ? intervals : [intervals];
    this.managers = list.map((i) => new RateLimitManager(i.windowMs, i.limit));
  }

  public async stamp(id: string): Promise<void> {
    for (const m of this.managers) {
      m.acquire(id).consume();
    }
  }

  public async isSpammy(id: string): Promise<boolean> {
    for (const m of this.managers) {
      if (m.acquire(id).limited) return true;
    }
    return false;
  }

  public async reset(id: string): Promise<void> {
    for (const m of this.managers) {
      m.delete(id);
    }
  }
}
