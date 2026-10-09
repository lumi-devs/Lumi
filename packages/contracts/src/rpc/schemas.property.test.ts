import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { z } from "zod";
import { boundedArray, PageSchema, PageSizeSchema, SnowflakeSchema } from "./schemas.js";

describe("SnowflakeSchema (property)", () => {
  it("accepts every digit string of length 17-20", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 17, maxLength: 20, unit: fc.constantFrom(..."0123456789") }),
        (digits) => {
          expect(SnowflakeSchema.parse(digits)).toBe(digits);
        },
      ),
    );
  });

  it("rejects digit strings outside the 17-20 length range", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 0, maxLength: 16, unit: fc.constantFrom(..."0123456789") }),
          fc.string({ minLength: 21, maxLength: 30, unit: fc.constantFrom(..."0123456789") }),
        ),
        (digits) => {
          expect(() => SnowflakeSchema.parse(digits)).toThrow();
        },
      ),
    );
  });

  it("rejects a valid-length string containing any non-digit character", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 17, maxLength: 20, unit: fc.constantFrom(..."0123456789") }),
        fc.integer({ min: 0, max: 19 }),
        fc.constantFrom(..."abcXYZ!@# "),
        (digits, position, badChar) => {
          fc.pre(position < digits.length);
          const withBadChar = digits.slice(0, position) + badChar + digits.slice(position + 1);
          expect(() => SnowflakeSchema.parse(withBadChar)).toThrow();
        },
      ),
    );
  });
});

describe("PageSchema / PageSizeSchema (property)", () => {
  it("accepts every integer >= 1 for page", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (page) => {
        expect(PageSchema.parse(page)).toBe(page);
      }),
    );
  });

  it("rejects every integer <= 0 and every non-integer for page", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1_000_000, max: 0 }),
          fc.double({ min: -1000, max: 1000, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (value) => {
          expect(() => PageSchema.parse(value)).toThrow();
        },
      ),
    );
  });

  it("accepts every integer in [1, 100] for page size and rejects anything outside", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (value) => {
        if (value >= 1 && value <= 100) {
          expect(PageSizeSchema.parse(value)).toBe(value);
        } else {
          expect(() => PageSizeSchema.parse(value)).toThrow();
        }
      }),
    );
  });
});

describe("boundedArray (property)", () => {
  it("accepts arrays whose length falls within [min, max] and rejects those outside", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.nat({ max: 10 }), fc.nat({ max: 10 })),
        fc.array(fc.integer(), { maxLength: 15 }),
        ([a, b], items) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const schema = boundedArray(z.number(), { min, max });
          if (items.length >= min && items.length <= max) {
            expect(schema.parse(items)).toEqual(items);
          } else {
            expect(() => schema.parse(items)).toThrow();
          }
        },
      ),
    );
  });
});
