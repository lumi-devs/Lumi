import type { User } from "discord.js";
import { Time } from "#src/shared/Index.ts";

const SuspiciousAccountAgeMs = 7 * Time.Day;

export function isSuspiciousAccount(user: User): boolean {
  const ageMs = Date.now() - user.createdTimestamp;
  return ageMs < SuspiciousAccountAgeMs || user.avatar === null;
}
