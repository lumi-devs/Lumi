import type { Container } from "#src/lib/Services.js";

export interface AntiSpamInterval {
  windowMs: number;
  limit: number;
}

function keyFor(key: string, id: string, windowMs: number): string {
  return `lumi:antispam:${key}:${windowMs}:${id}`;
}

export class AntiSpam {
  private readonly intervals: AntiSpamInterval[];

  public constructor(
    private readonly services: Container,
    private readonly key: string,
    intervals: AntiSpamInterval | AntiSpamInterval[],
  ) {
    this.intervals = Array.isArray(intervals) ? intervals : [intervals];
  }

  public async stamp(id: string): Promise<void> {
    for (const { windowMs } of this.intervals) {
      const key = keyFor(this.key, id, windowMs);
      const count = await this.services.valkey.incr(key);
      if (count === 1) await this.services.valkey.pexpire(key, windowMs);
    }
  }

  public async isSpammy(id: string): Promise<boolean> {
    for (const { windowMs, limit } of this.intervals) {
      const count = await this.services.valkey.get(keyFor(this.key, id, windowMs));
      if (count !== null && Number(count) >= limit) return true;
    }
    return false;
  }

  public async reset(id: string): Promise<void> {
    for (const { windowMs } of this.intervals) {
      await this.services.valkey.del(keyFor(this.key, id, windowMs));
    }
  }
}
