export class AdderError extends Error {
  public readonly amount: number;
  public constructor(message: string, amount: number) {
    super(message);
    this.amount = amount;
    this.name = "AdderError";
  }
}

export class Adder<T> extends Array<{ id: T; end: number }> {
  public maximum: number;
  public duration: number;
  public autoRemove: boolean;

  public constructor(maximum: number, duration: number, autoRemove = false) {
    super();
    this.maximum = maximum;
    this.duration = duration;
    this.autoRemove = autoRemove;
  }

  public add(id: T, times = 1): number {
    this.sweep();
    const amount = this.count(id) + times;

    for (let i = 0; i < times; i++) {
      this.push({ id, end: Date.now() + this.duration });
    }

    if (amount > this.maximum) {
      if (this.autoRemove) this.remove(id);
      throw new AdderError(`${String(id)} exceeded ${this.maximum}`, amount);
    }

    return amount;
  }

  public count(id: T): number {
    return this.filter((e) => e.id === id).length;
  }

  public remove(id: T): number {
    let removed = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      if (this[i]!.id === id) {
        this.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  public sweep(): void {
    const now = Date.now();
    let i = this.length;
    while (i--) {
      if (this[i]!.end <= now) this.splice(i, 1);
    }
  }
}
