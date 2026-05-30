export class SortedCollection<
  K extends number | string | bigint,
  V,
> implements Map<K, V> {
  public readonly [Symbol.toStringTag]: string = "SortedCollection";
  readonly #entries: [K, V][] = [];
  readonly #comparator: (a: K, b: K) => number;

  public constructor(
    data?: Iterable<[K, V]>,
    comparator: (a: K, b: K) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  ) {
    this.#comparator = comparator;
    if (data) {
      this.#entries.push(...data);
      this.#entries.sort(([a], [b]) => this.#comparator(a, b));
    }
  }

  public set(key: K, value: V): this {
    const idx = this.#findIndex(key);
    if (idx >= 0) {
      this.#entries[idx]![1] = value;
    } else {
      this.#entries.splice(~idx, 0, [key, value]);
    }
    return this;
  }

  public get(key: K): V | undefined {
    const idx = this.#findIndex(key);
    return idx >= 0 ? this.#entries[idx]![1] : undefined;
  }

  public has(key: K): boolean {
    return this.#findIndex(key) >= 0;
  }

  public delete(key: K): boolean {
    const idx = this.#findIndex(key);
    if (idx < 0) return false;
    this.#entries.splice(idx, 1);
    return true;
  }

  public get size(): number {
    return this.#entries.length;
  }

  public clear(): void {
    this.#entries.length = 0;
  }

  public first(): V | undefined {
    return this.#entries[0]?.[1];
  }

  public last(): V | undefined {
    return this.#entries[this.#entries.length - 1]?.[1];
  }

  public firstKey(): K | undefined {
    return this.#entries[0]?.[0];
  }

  public lastKey(): K | undefined {
    return this.#entries[this.#entries.length - 1]?.[0];
  }

  public [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#entries[Symbol.iterator]() as unknown as MapIterator<[K, V]>;
  }

  public entries(): MapIterator<[K, V]> {
    return this.#entries[Symbol.iterator]() as unknown as MapIterator<[K, V]>;
  }

  public keys(): MapIterator<K> {
    return this.#entries
      .map(([k]) => k)
      [Symbol.iterator]() as unknown as MapIterator<K>;
  }

  public values(): MapIterator<V> {
    return this.#entries
      .map(([, v]) => v)
      [Symbol.iterator]() as unknown as MapIterator<V>;
  }

  public forEach(
    cb: (v: V, k: K, map: Map<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [k, v] of this.#entries) cb.call(thisArg, v, k, this);
  }

  #findIndex(key: K): number {
    let lo = 0;
    let hi = this.#entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const cmp = this.#comparator(this.#entries[mid]![0], key);
      if (cmp < 0) lo = mid + 1;
      else if (cmp > 0) hi = mid - 1;
      else return mid;
    }
    return ~lo;
  }
}
