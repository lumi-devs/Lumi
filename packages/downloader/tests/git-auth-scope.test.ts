import { afterEach, describe, expect, it } from "vitest";
import { createGitAuth } from "../src/git.js";

const previousToken = process.env.GIT_TOKEN;
const previousUsername = process.env.GIT_USERNAME;

afterEach(() => {
  if (previousToken === undefined) delete process.env.GIT_TOKEN;
  else process.env.GIT_TOKEN = previousToken;
  if (previousUsername === undefined) delete process.env.GIT_USERNAME;
  else process.env.GIT_USERNAME = previousUsername;
});

describe("git authentication", () => {
  it("scopes credentials to the repository origin", () => {
    process.env.GIT_TOKEN = "test-token";
    const auth = createGitAuth("https://example.com/org/repo.git");

    expect(auth?.("https://example.com/org/repo.git/info/refs")).toEqual({
      username: "x-access-token",
      password: "test-token",
    });
    expect(auth?.("https://example.com/other/repo.git")).toEqual({
      username: "x-access-token",
      password: "test-token",
    });
    expect(auth?.("https://evil.example/repo.git")).toBeUndefined();
    expect(auth?.("https://example.com.evil.example/repo.git")).toBeUndefined();
  });

  it("returns no credentials without a token or valid URL", () => {
    delete process.env.GIT_TOKEN;
    expect(createGitAuth("https://example.com/org/repo.git")).toBeUndefined();

    process.env.GIT_TOKEN = "test-token";
    expect(createGitAuth("not a url")).toBeUndefined();
  });

  it("honors a configured username", () => {
    process.env.GIT_TOKEN = "test-token";
    process.env.GIT_USERNAME = "custom-user";
    const auth = createGitAuth("https://example.com/org/repo.git");

    expect(auth?.("https://example.com/org/repo.git")).toEqual({
      username: "custom-user",
      password: "test-token",
    });
  });
});
