import * as devalue from "devalue";

export interface Codec<T> {
  encode(value: T): string;
  decode(value: string): T;
  encodeNull(): string;
}

function createCodec<T>(): Codec<T> {
  return {
    encode(value: T): string {
      return devalue.stringify(value);
    },
    decode(value: string): T {
      return devalue.parse(value) as T;
    },
    encodeNull(): string {
      return devalue.stringify(null);
    },
  };
}

export { createCodec };