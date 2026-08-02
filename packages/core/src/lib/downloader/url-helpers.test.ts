import { describe, expect, it } from "vitest";
import { deriveRepoNameFromUrl } from "./url-helpers.js";

const NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;

describe("deriveRepoNameFromUrl", () => {
  it("derives from a plain HTTPS URL", () => {
    expect(deriveRepoNameFromUrl("https://github.com/owner/repo")).toBe("repo");
  });

  it("strips a trailing .git suffix", () => {
    expect(deriveRepoNameFromUrl("https://github.com/owner/repo.git")).toBe("repo");
  });

  it("strips a trailing slash", () => {
    expect(deriveRepoNameFromUrl("https://github.com/owner/repo/")).toBe("repo");
  });

  it("derives from the SSH shorthand form (git@host:owner/repo.git)", () => {
    expect(deriveRepoNameFromUrl("git@github.com:owner/repo.git")).toBe("repo");
  });

  it("derives from the SSH URL form (ssh://git@host/owner/repo.git)", () => {
    expect(deriveRepoNameFromUrl("ssh://git@github.com/owner/repo.git")).toBe("repo");
  });

  it("derives from the bare owner/repo shorthand", () => {
    expect(deriveRepoNameFromUrl("owner/repo")).toBe("repo");
  });

  it("drops the owner segment, keeping only the final path component", () => {
    expect(deriveRepoNameFromUrl("https://github.com/some-org/my-cool-addon-repo")).toBe(
      "my-cool-addon-repo",
    );
  });

  it("sanitizes characters the name regex rejects (e.g. dots)", () => {
    const derived = deriveRepoNameFromUrl("https://github.com/owner/my.repo.name");
    expect(derived).toMatch(NAME_RE);
    expect(derived).toBe("my-repo-name");
  });

  it("never returns a name starting with a hyphen", () => {
    const derived = deriveRepoNameFromUrl("https://github.com/owner/--weird-repo");
    expect(derived).toMatch(NAME_RE);
  });

  it("falls back to a default name when nothing usable remains", () => {
    expect(deriveRepoNameFromUrl("")).toBe("repo");
    expect(deriveRepoNameFromUrl("https://github.com/owner/...")).toBe("repo");
  });

  it("always produces a name that satisfies the resolver.ts name regex", () => {
    const inputs = [
      "https://github.com/owner/repo",
      "https://github.com/owner/repo.git",
      "git@github.com:owner/repo.git",
      "ssh://git@github.com/owner/repo.git",
      "owner/repo",
      "https://gitlab.com/group/sub-group/repo.git",
    ];
    for (const url of inputs) {
      expect(deriveRepoNameFromUrl(url)).toMatch(NAME_RE);
    }
  });
});
