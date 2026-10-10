import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import {
  computePageCount,
  sliceForPage,
  clampPageIndex,
} from "@lumi/lib/utilities/pagination.js";

describe("computePageCount (property)", () => {
  it("equals ceil(itemCount / perPage), floored to a minimum of 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 500 }),
        (itemCount, perPage) => {
          const expected = Math.max(1, Math.ceil(itemCount / perPage));
          expect(computePageCount(itemCount, perPage)).toBe(expected);
        },
      ),
    );
  });

  it("is always at least 1, even for zero items", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (perPage) => {
        expect(computePageCount(0, perPage)).toBe(1);
      }),
    );
  });
});

describe("sliceForPage (property)", () => {
  it("every item appears exactly once across all pages, in original order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, perPage) => {
          const totalPages = computePageCount(items.length, perPage);
          const reassembled: number[] = [];
          for (let page = 0; page < totalPages; page++) {
            reassembled.push(...sliceForPage(items, perPage, page));
          }
          expect(reassembled).toEqual(items);
        },
      ),
    );
  });

  it("no page (within range) ever exceeds perPage items, and only the last page may be shorter", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 200 }),
        fc.integer({ min: 1, max: 50 }),
        (items, perPage) => {
          const totalPages = computePageCount(items.length, perPage);
          for (let page = 0; page < totalPages; page++) {
            const slice = sliceForPage(items, perPage, page);
            expect(slice.length).toBeLessThanOrEqual(perPage);
            if (page < totalPages - 1) {
              expect(slice.length).toBe(perPage);
            }
          }
        },
      ),
    );
  });

  it("a page index at or beyond the item count yields an empty slice", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 50 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 50 }),
        (items, perPage, extraPages) => {
          const totalPages = computePageCount(items.length, perPage);
          expect(sliceForPage(items, perPage, totalPages + extraPages)).toEqual([]);
        },
      ),
    );
  });
});

describe("clampPageIndex (property)", () => {
  it("always returns a value within [0, totalPages - 1]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 500 }),
        (pageIndex, totalPages) => {
          const clamped = clampPageIndex(pageIndex, totalPages);
          expect(clamped).toBeGreaterThanOrEqual(0);
          expect(clamped).toBeLessThanOrEqual(totalPages - 1);
        },
      ),
    );
  });

  it("is a no-op for any index already within range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain((totalPages) =>
          fc.tuple(fc.constant(totalPages), fc.integer({ min: 0, max: totalPages - 1 })),
        ),
        ([totalPages, pageIndex]) => {
          expect(clampPageIndex(pageIndex, totalPages)).toBe(pageIndex);
        },
      ),
    );
  });
});
