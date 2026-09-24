import { describe, it, expect } from "bun:test";
import { paginate } from "#lib/rpc/validation.js";

describe("paginate", () => {
  it("defaults to the first page of twenty-five", () => {
    expect(paginate({})).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
  });

  it("skips whole pages ahead of the requested page", () => {
    expect(paginate({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it("keeps skip at zero on the first page for any page size", () => {
    expect(paginate({ page: 1, pageSize: 100 }).skip).toBe(0);
  });

  it("applies the default page size when only a page is given", () => {
    expect(paginate({ page: 2 })).toEqual({
      page: 2,
      pageSize: 25,
      skip: 25,
      take: 25,
    });
  });

  it("applies the default page when only a page size is given", () => {
    expect(paginate({ pageSize: 5 })).toEqual({
      page: 1,
      pageSize: 5,
      skip: 0,
      take: 5,
    });
  });
});
