/**
 * Minimal FIFO mutex with `wait()` / `shift()` / `remaining` semantics.
 * Work is serialized per key: `await mutex.wait()` runs exclusively until
 * `mutex.shift()` (always in a `finally`), then the next waiter proceeds.
 */
export class Mutex {
  #tail: Promise<void> = Promise.resolve();
  #releases: Array<() => void> = [];
  #count = 0;

  /** Number of current + queued holders. */
  get remaining(): number {
    return this.#count;
  }

  /** Resolves when the caller holds the lock. Always pair with `shift()`. */
  wait(): Promise<void> {
    this.#count++;
    const head = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#releases.push(release);
    return head;
  }

  /** Releases the lock, waking the next waiter (if any). */
  shift(): void {
    this.#count = Math.max(0, this.#count - 1);
    this.#releases.shift()?.();
  }
}
