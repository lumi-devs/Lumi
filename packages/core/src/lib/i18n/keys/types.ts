/**
 * Skyra-style typed i18n keys. `T` marks a plain key; `FT` carries the
 * interpolation argument shape so `t(key, args)` is compile-checked.
 */
export type TypedT<TReturn = string> = string & { __return__?: TReturn };
export type TypedFT<TArgs, TReturn = string> = string & {
  __args__?: TArgs;
  __return__?: TReturn;
};

export function T<TReturn = string>(key: string): TypedT<TReturn> {
  return key;
}

export function FT<TArgs, TReturn = string>(
  key: string,
): TypedFT<TArgs, TReturn> {
  return key;
}
