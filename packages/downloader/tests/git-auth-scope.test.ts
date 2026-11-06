import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clone } from "../src/git.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("git authentication", () => {
  it("scopes the auth header to the repository origin", async () => {
    const bin = await mkdtemp(join(tmpdir(), "lumi-git-auth-"));
    roots.push(bin);
    const capture = join(bin, "capture");
    const git = join(bin, "git");
    await writeFile(
      git,
      '#!/bin/sh\nprintf \'%s\\n%s\\n\' "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" > "$CAPTURE_FILE"\n',
    );
    await chmod(git, 0o755);

    const previousPath = process.env.PATH;
    const previousToken = process.env.GIT_TOKEN;
    const previousCapture = process.env.CAPTURE_FILE;
    process.env.PATH = bin;
    process.env.GIT_TOKEN = "test-token";
    process.env.CAPTURE_FILE = capture;
    try {
      await clone(
        "https://example.com/org/repo.git",
        join(bin, "checkout"),
        null,
      );
      const [key, value] = (await readFile(capture, "utf8")).trim().split("\n");
      expect(key).toBe("http.https://example.com/.extraheader");
      expect(value).toMatch(/^Authorization: Basic /);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousToken === undefined) delete process.env.GIT_TOKEN;
      else process.env.GIT_TOKEN = previousToken;
      if (previousCapture === undefined) delete process.env.CAPTURE_FILE;
      else process.env.CAPTURE_FILE = previousCapture;
    }
  });
});
