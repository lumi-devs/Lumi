import { describe, expect, it } from "vitest";
import { repoNameFromUrl } from "../src/repoName.js";

describe("repoNameFromUrl", () => {
  it("uses the repository name from the URL", () => {
    expect(repoNameFromUrl("https://github.com/owner/My-Repo.git")).toBe(
      "my-repo",
    );
  });

  it("sanitizes characters and leading digits", () => {
    expect(repoNameFromUrl("https://example.com/owner/123_repo.git")).toBe(
      "repo-123-repo",
    );
  });

  it("falls back to the hostname when the path has no name", () => {
    expect(repoNameFromUrl("https://Example.COM/")).toBe("example-com");
  });

  it("returns an empty name for an invalid URL", () => {
    expect(repoNameFromUrl("not a url")).toBe("");
  });
});
