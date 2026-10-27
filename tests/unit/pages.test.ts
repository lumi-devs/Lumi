import { describe, expect, it } from "vitest";
import { paginate, pagesOf } from "../../src/admin/panel/pages.ts";

describe("pagesOf", () => {
  it("splits items into fixed-size pages", () => {
    expect(pagesOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no pages for an empty list", () => {
    expect(pagesOf([], 4)).toEqual([]);
  });
});

describe("paginate", () => {
  it("returns the requested page", () => {
    expect(paginate([1, 2, 3, 4, 5], 1, 2)).toEqual({
      items: [3, 4],
      page: 1,
      totalPages: 3,
    });
  });

  it("treats an empty list as one empty page", () => {
    expect(paginate([], 0, 4)).toEqual({ items: [], page: 0, totalPages: 1 });
  });

  it("clamps pages past the end and below zero", () => {
    expect(paginate([1, 2, 3], 99, 2).page).toBe(1);
    expect(paginate([1, 2, 3], -5, 2).page).toBe(0);
    expect(paginate([1, 2, 3], 1.8, 2).page).toBe(1);
  });
});
