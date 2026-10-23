import { parse, stringify } from "devalue";

export interface Codec {
  encode(value: unknown): string;
  decode(raw: string): unknown;
}

export const codec: Codec = {
  encode: stringify,
  decode: parse,
};
