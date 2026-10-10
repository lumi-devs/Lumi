import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import {
  cfg,
  validateModuleConfigValue,
  snowflakeString,
  durationString,
  choiceEnum,
} from "@lumi/lib/module-system/config-schema.js";

describe("snowflakeString (property)", () => {
  const validator = snowflakeString();

  it("accepts every string of 17-20 digits, unchanged", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 17, maxLength: 20, unit: fc.constantFrom(..."0123456789") }),
        (digits) => {
          expect(validator.parse(digits)).toBe(digits);
        },
      ),
    );
  });

  it("rejects digit-only strings outside the 17-20 length range", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 16, unit: fc.constantFrom(..."0123456789") }),
          fc.string({ minLength: 21, maxLength: 30, unit: fc.constantFrom(..."0123456789") }),
        ),
        (digits) => {
          expect(() => validator.parse(digits)).toThrow();
        },
      ),
    );
  });

  it("rejects a 17-20 length string containing any non-digit character", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 17, maxLength: 20, unit: fc.constantFrom(..."0123456789") }),
        fc.integer({ min: 0, max: 19 }),
        fc.constantFrom(..."abcXYZ!@# "),
        (digits, position, badChar) => {
          fc.pre(position < digits.length);
          const withBadChar = digits.slice(0, position) + badChar + digits.slice(position + 1);
          expect(() => validator.parse(withBadChar)).toThrow();
        },
      ),
    );
  });
});

describe("durationString (property)", () => {
  const validator = durationString();

  it("accepts any non-negative integer amount paired with a valid unit", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.constantFrom("s", "m", "h", "d"),
        (amount, unit) => {
          const value = `${amount}${unit}`;
          expect(validator.parse(value)).toBe(value);
        },
      ),
    );
  });

  it("rejects an amount paired with an invalid unit", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc
          .string({ minLength: 1, maxLength: 1 })
          .filter((c) => !"smhd".includes(c) && !/\d/.test(c)),
        (amount, unit) => {
          expect(() => validator.parse(`${amount}${unit}`)).toThrow();
        },
      ),
    );
  });

  it("rejects a valid amount/unit pair with trailing garbage", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.constantFrom("s", "m", "h", "d"),
        fc.string({ minLength: 1, maxLength: 5 }).filter((s) => s.trim().length > 0),
        (amount, unit, trailer) => {
          expect(() => validator.parse(`${amount}${unit}${trailer}`)).toThrow();
        },
      ),
    );
  });

  it("rejects a bare unit with no digits", () => {
    fc.assert(
      fc.property(fc.constantFrom("s", "m", "h", "d"), (unit) => {
        expect(() => validator.parse(unit)).toThrow();
      }),
    );
  });
});

describe("choiceEnum (property)", () => {
  it("accepts every declared choice and rejects any value outside the set", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        (choices, outsider) => {
          fc.pre(!choices.includes(outsider));
          const validator = choiceEnum(choices as [string, ...string[]]);
          for (const choice of choices) {
            expect(validator.parse(choice)).toBe(choice);
          }
          expect(() => validator.parse(outsider)).toThrow();
        },
      ),
    );
  });
});

describe("cfg.number min/max via validateModuleConfigValue (property)", () => {
  it("accepts values within [min, max] and rejects values strictly outside", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 })),
        fc.integer({ min: -2000, max: 2000 }),
        ([a, b], value) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const schema = cfg.object({
            limit: cfg.number({ label: "Limit", description: "x", min, max }),
          });
          if (value >= min && value <= max) {
            expect(validateModuleConfigValue(schema, "limit", value)).toBe(value);
          } else {
            expect(() => validateModuleConfigValue(schema, "limit", value)).toThrow();
          }
        },
      ),
    );
  });
});
