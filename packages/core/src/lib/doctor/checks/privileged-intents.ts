import { REST } from "@discordjs/rest";
import {
  ApplicationFlags,
  Routes,
  type APIApplication,
} from "discord-api-types/v10";
import { GatewayIntentBits } from "discord.js";
import { buildRestOptions } from "#lib/discord/options.js";
import { buildClientOptions } from "#lib/client/client-options.js";
import { getBotToken } from "#lib/env.js";
import { runCheck } from "#lib/doctor/util.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

export const PrivilegedIntentsCheckName = "privileged-intents";

/**
 * Every privileged Gateway intent, mapped to the `ApplicationFlags` bit(s)
 * that mean Discord has actually enabled it for this application - either
 * the unrestricted flag (verified bots) or the "limited" flag (unverified,
 * capped at 100 guilds) count as enabled.
 */
const PrivilegedIntentFlags: {
  intent: number;
  name: string;
  flags: number;
}[] = [
  {
    intent: GatewayIntentBits.GuildMembers,
    name: "GuildMembers",
    flags: ApplicationFlags.GatewayGuildMembers | ApplicationFlags.GatewayGuildMembersLimited,
  },
  {
    intent: GatewayIntentBits.GuildPresences,
    name: "GuildPresences",
    flags: ApplicationFlags.GatewayPresence | ApplicationFlags.GatewayPresenceLimited,
  },
  {
    intent: GatewayIntentBits.MessageContent,
    name: "MessageContent",
    flags: ApplicationFlags.GatewayMessageContent | ApplicationFlags.GatewayMessageContentLimited,
  },
];

export interface PrivilegedIntentsCheckDeps {
  /** Override for tests; defaults to `getBotToken()`. */
  getToken?: () => string;
  /** Override for tests. Real implementation calls `GET /applications/@me`. */
  fetchApplication?: (token: string) => Promise<APIApplication>;
  /**
   * Override for tests; defaults to the intents `buildClientOptions()`
   * requests, the same list `LumiClient` is actually constructed with.
   */
  requestedIntents?: readonly number[];
}

async function defaultFetchApplication(token: string): Promise<APIApplication> {
  const rest = new REST(buildRestOptions()).setToken(token);
  return (await rest.get(Routes.currentApplication())) as APIApplication;
}

export async function checkPrivilegedIntents(
  deps: PrivilegedIntentsCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(PrivilegedIntentsCheckName, timeoutMs, async () => {
    let token: string;
    try {
      token = (deps.getToken ?? getBotToken)();
    } catch {
      return {
        name: PrivilegedIntentsCheckName,
        status: "fail",
        detail: "BOT_TOKEN is not set.",
        hint: "Set BOT_TOKEN in the environment.",
      };
    }

    const requestedIntents =
      deps.requestedIntents ?? (buildClientOptions().intents as number[]);
    const requestedBitfield = requestedIntents.reduce((acc, bit) => acc | bit, 0);

    let application: APIApplication;
    try {
      const fetchApplication = deps.fetchApplication ?? defaultFetchApplication;
      application = await fetchApplication(token);
    } catch (err) {
      return {
        name: PrivilegedIntentsCheckName,
        status: "fail",
        detail: `GET /applications/@me failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Confirm BOT_TOKEN is valid.",
      };
    }

    const appFlags = application.flags ?? 0;
    const missing = PrivilegedIntentFlags.filter(
      ({ intent, flags }) =>
        (requestedBitfield & intent) !== 0 && (appFlags & flags) === 0,
    ).map(({ name }) => name);

    if (missing.length > 0) {
      return {
        name: PrivilegedIntentsCheckName,
        status: "warn",
        detail: `Requested privileged intent(s) not enabled in the Discord developer portal: ${missing.join(", ")}.`,
        hint: "Enable them under Bot > Privileged Gateway Intents, or the gateway connection will be rejected.",
      };
    }
    return {
      name: PrivilegedIntentsCheckName,
      status: "ok",
      detail: "All requested privileged intents are enabled.",
    };
  });
}
