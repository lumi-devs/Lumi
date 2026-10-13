import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getRepoRoot } from "#src/lib/Env.js";

export function dataFile(...parts: string[]): string {
  const base =
    process.env["DATA_DIR"]?.trim() || path.join(getRepoRoot(), "data");
  return path.join(base, ...parts);
}

export function loadOrMintKeyFile(file: string): Buffer {
  try {
    const key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    if (key.length === 32) return key;
    throw new Error(
      `corrupt key file at ${file}; delete it to mint a fresh one`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  const key = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}

export function sealBytes(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    body.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function openSealedBytes(key: Buffer, sealed: string): Buffer | null {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== "v1" || !iv || !body || !tag) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}

export function sealString(key: Buffer, plaintext: string): string {
  return sealBytes(key, Buffer.from(plaintext, "utf8"));
}

export function openSealedString(key: Buffer, sealed: string): string | null {
  const raw = openSealedBytes(key, sealed);
  return raw ? raw.toString("utf8") : null;
}

export function hmacWith(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}
