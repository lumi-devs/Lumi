export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  isOk(): this is Ok<T>;
  isErr(): false;
  unwrap(): T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
  isOk(): false;
  isErr(): this is Err<E>;
  unwrap(): never;
}

export type Result<T, E = unknown> = Ok<T> | Err<E>;

export const Result = {
  ok<T>(value: T): Ok<T> {
    return {
      ok: true,
      value,
      isOk(this: Ok<T>): this is Ok<T> {
        return true;
      },
      isErr: () => false,
      unwrap: () => value,
    };
  },
  err<E>(error: E): Err<E> {
    return {
      ok: false,
      error,
      isOk: () => false,
      isErr(this: Err<E>): this is Err<E> {
        return true;
      },
      unwrap: () => {
        throw error instanceof Error ? error : new Error(String(error));
      },
    };
  },
};
