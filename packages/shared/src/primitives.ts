/**
 * Small dependency-free helpers shared by every Lumi package: time constants,
 * text/JSON utilities, and an async-friendly `Awaitable` type. Single home for
 * this stuff — import from `@lumi/shared`, never copy it per package.
 */

export type Awaitable<T> = PromiseLike<T> | T;

export const Ms = {
  Second: 1_000,
  Minute: 60_000,
  Hour: 3_600_000,
  Day: 86_400_000,
} as const;

export function isNullish(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Returns the parsed value, or the original input when parsing fails. */
export function tryParseJSON(value: string, reviver?: Parameters<typeof JSON.parse>[1]): unknown {
  try {
    return JSON.parse(value, reviver);
  } catch {
    return value;
  }
}

const WordSeparatorCharacter = /[\p{Separator}\p{Punctuation}\p{Control}]/u;

/** Truncates to `length` codepoints at a word boundary, appending an ellipsis. */
export function cutText(str: string, length: number): string {
  if (str.length <= length) return str;
  const codepoints = [...str];
  if (codepoints.length <= length) return str;
  let lastSeparator = length;
  for (let i = 0; i < length; ++i) {
    const ch = codepoints[i];
    if (ch !== undefined && WordSeparatorCharacter.test(ch)) {
      lastSeparator = i;
    }
  }
  const lastCharacterIndex = lastSeparator === length ? length - 1 : lastSeparator;
  return codepoints.slice(0, lastCharacterIndex).concat("…").join("");
}

export function chunk<T>(array: readonly T[], chunkSize: number): T[][] {
  if (!Array.isArray(array)) throw new TypeError("entries must be an array.");
  if (!Number.isInteger(chunkSize)) throw new TypeError("chunkSize must be an integer.");
  if (chunkSize < 1) throw new RangeError("chunkSize must be 1 or greater.");
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) chunks.push(array.slice(i, i + chunkSize));
  return chunks;
}

export function filterNullish<T>(value: T): value is NonNullable<T> {
  return !isNullish(value);
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && (input as { constructor: unknown }).constructor === Object;
}

function isPrimitive(input: unknown): boolean {
  return ["string", "bigint", "number", "boolean"].includes(typeof input);
}

// ponytail: structured-clone covers this on modern runtimes; kept explicit to
// preserve class-preserving clone behavior for config defaults.
function deepClone<T>(source: T): T {
  if (source === null || isPrimitive(source)) return source;
  if (source instanceof Date) return new (source.constructor as new (s: Date) => T)(source);
  if (source instanceof Map) {
    const output = new (source.constructor as new () => Map<unknown, unknown>)();
    for (const [key, value] of source.entries()) output.set(key, deepClone(value));
    return output as T;
  }
  if (source instanceof Set) {
    const output = new (source.constructor as new () => Set<unknown>)();
    for (const value of source.values()) output.add(deepClone(value));
    return output as T;
  }
  if (Array.isArray(source)) {
    const output = new (source.constructor as new (n: number) => unknown[])(source.length);
    for (let i = 0; i < source.length; i++) output[i] = deepClone(source[i]);
    return output as T;
  }
  if (typeof source === "object") {
    const output = new ((source as object).constructor as new () => Record<string, unknown>)();
    for (const [key, value] of Object.entries(source)) {
      Object.defineProperty(output, key, { configurable: true, enumerable: true, value: deepClone(value), writable: true });
    }
    return output as T;
  }
  return source;
}

/**
 * Deep-merges `base` defaults into `overwrites` (mutates and returns it).
 * Missing keys are filled with cloned defaults; plain objects merge recursively.
 */
export function mergeDefault<A extends object, B extends object>(base: A, overwrites?: B): A & B {
  if (!overwrites) return deepClone(base) as A & B;
  for (const [baseKey, baseValue] of Object.entries(base)) {
    const existing = Reflect.get(overwrites, baseKey);
    if (typeof existing === "undefined") {
      Reflect.set(overwrites, baseKey, deepClone(baseValue));
    } else if (isObject(existing)) {
      Reflect.set(overwrites, baseKey, mergeDefault(baseValue ?? {}, existing));
    }
  }
  return overwrites as A & B;
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const ToTitleCasePattern = /[A-Za-zÀ-ÖØ-öø-ÿ]\S*/g;

const TitleCaseVariants: Record<string, string> = {
  textchannel: "TextChannel",
  voicechannel: "VoiceChannel",
  categorychannel: "CategoryChannel",
  guildmember: "GuildMember",
};

export function toTitleCase(
  str: string,
  options: { additionalVariants?: Record<string, string>; caseSensitive?: boolean } = {},
): string {
  const { additionalVariants = {}, caseSensitive } = options;
  const variants = {
    ...TitleCaseVariants,
    ...(caseSensitive
      ? additionalVariants
      : Object.entries(additionalVariants).reduce<Record<string, string>>(
          (acc, [key, variant]) => ({ ...acc, [key.toLowerCase()]: variant }),
          {},
        )),
  };
  return str.replace(ToTitleCasePattern, (txt) => {
    const hit = variants[caseSensitive ? txt : txt.toLowerCase()];
    return hit ?? txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
  });
}
