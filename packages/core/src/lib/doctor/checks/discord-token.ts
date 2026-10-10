import { REST, RequestMethod } from "@discordjs/rest";
import { Routes, type APIUser } from "discord-api-types/v10";
import { buildRestOptions } from "@lumi/lib/discord/options.js";
import { getBotToken } from "@lumi/lib/env.js";
import { runCheck } from "@lumi/lib/doctor/run-check.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

export const DiscordTokenCheckName = "discord-token";

const WarnSkewMs = 5_000;
const FailSkewMs = 60_000;

export interface DiscordTokenFetchResult {
  user: APIUser;
  date: Date | null;
}

export interface DiscordTokenCheckDeps {
  /** Override for tests; defaults to `getBotToken()`. */
  getToken?: () => string;
  /**
   * Override for tests. Real implementation calls `GET /users/@me` with
   * `@discordjs/rest` directly (no gateway login) and reads the response's
   * `Date` header for clock-skew detection.
   */
  fetchMe?: (token: string) => Promise<DiscordTokenFetchResult>;
}

async function defaultFetchMe(token: string): Promise<DiscordTokenFetchResult> {
  const rest = new REST(buildRestOptions()).setToken(token);
  const response = (await rest.queueRequest({
    fullRoute: Routes.user(),
    method: RequestMethod.Get,
    auth: true,
  })) as Response;
  const dateHeader = response.headers.get("date");
  const user = (await response.json()) as APIUser;
  return { user, date: dateHeader ? new Date(dateHeader) : null };
}

export async function checkDiscordToken(
  deps: DiscordTokenCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(DiscordTokenCheckName, timeoutMs, async () => {
    let token: string;
    try {
      token = (deps.getToken ?? getBotToken)();
    } catch {
      return {
        name: DiscordTokenCheckName,
        status: "fail",
        detail: "BOT_TOKEN is not set.",
        hint: "Set BOT_TOKEN in the environment.",
      };
    }

    const fetchMe = deps.fetchMe ?? defaultFetchMe;
    let result: DiscordTokenFetchResult;
    try {
      result = await fetchMe(token);
    } catch (err) {
      return {
        name: DiscordTokenCheckName,
        status: "fail",
        detail: `GET /users/@me failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Confirm BOT_TOKEN is valid and has not been reset/revoked in the Discord developer portal.",
      };
    }

    const { user, date } = result;
    const identity = `${user.username} (${user.id})`;
    if (!date) {
      return {
        name: DiscordTokenCheckName,
        status: "ok",
        detail: `Authenticated as ${identity}.`,
      };
    }

    const skewMs = Math.abs(Date.now() - date.getTime());
    const skewSecs = Math.round(skewMs / 1000);
    if (skewMs > FailSkewMs) {
      return {
        name: DiscordTokenCheckName,
        status: "fail",
        detail: `Authenticated as ${identity}, but the system clock is skewed ${skewSecs}s from Discord's.`,
        hint: "Fix NTP/system clock sync - large clock skew breaks gateway session resumption and request signing.",
      };
    }
    if (skewMs > WarnSkewMs) {
      return {
        name: DiscordTokenCheckName,
        status: "warn",
        detail: `Authenticated as ${identity}; clock skew is ${skewSecs}s.`,
        hint: "Check NTP sync on this host.",
      };
    }
    return {
      name: DiscordTokenCheckName,
      status: "ok",
      detail: `Authenticated as ${identity}; clock skew ${skewSecs}s.`,
    };
  });
}
