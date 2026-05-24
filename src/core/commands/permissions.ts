import { ApplyOptions } from "@sapphire/decorators";
import { container, type Args } from "@sapphire/framework";
import { EmberSubcommand } from "#lib/commands.js";
import { PermissionLevel, type PermissionModelType } from "#lib/permissions.js";
import type { Message } from "discord.js";
import {
  makeListCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { fetchT } from "@sapphire/plugin-i18next";
import { EmberEmojis } from "#utilities/assets.js";

const MODEL_TYPES = [
  "role",
  "user",
  "channel",
  "category",
  "everyone",
] as const satisfies readonly PermissionModelType[];
type ModelType = (typeof MODEL_TYPES)[number];

interface PermissionOverrideRow {
  commandPath: string;
  modelType: string;
  modelId: string;
  allow: boolean;
}

function formatOverride(row: PermissionOverrideRow): string {
  const emoji = row.allow ? EmberEmojis.CHECK : EmberEmojis.CROSS;
  let mention: string;
  if (row.modelType === "everyone") mention = "@everyone";
  else if (row.modelType === "role") mention = `<@&${row.modelId}>`;
  else if (row.modelType === "user") mention = `<@${row.modelId}>`;
  else if (row.modelType === "category") mention = `category <#${row.modelId}>`;
  else mention = `<#${row.modelId}>`;
  return `${emoji} \`${row.commandPath}\` — ${row.modelType} ${mention}`;
}

@ApplyOptions<EmberSubcommand.Options>({
  name: "permissions",
  description: "Manage command permission overrides for this guild.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    { name: "allow", messageRun: "messageRunAllow" },
    { name: "deny", messageRun: "messageRunDeny" },
    { name: "reset", messageRun: "messageRunReset" },
    { name: "list", messageRun: "messageRunList" },
  ],
})
export class PermissionsCommand extends EmberSubcommand {
  private get permissionService(): import("#core/services/PermissionService.js").PermissionService {
    return this.container.stores
      .get("services")
      .get(
        "permissions",
      ) as import("#core/services/PermissionService.js").PermissionService;
  }

  public async messageRunAllow(message: Message, args: Args): Promise<void> {
    return this.#write(message, args, true);
  }

  public async messageRunDeny(message: Message, args: Args): Promise<void> {
    return this.#write(message, args, false);
  }

  public async messageRunReset(message: Message, args: Args): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const typeRaw = await args.pick("string").catch(() => null);
    const targetRaw = await args.pick("string").catch(() => null);

    if (!commandPath) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,permissions reset <command_path> [type] [target]`",
        ),
      );
      return;
    }

    const type = typeRaw ? (typeRaw.toLowerCase() as ModelType) : null;
    if (type && !MODEL_TYPES.includes(type)) {
      await message.reply(
        makeErrorCard(
          "Invalid Type",
          `Type must be one of: ${MODEL_TYPES.join(", ")}`,
        ),
      );
      return;
    }

    const guildId = message.guildId!;

    try {
      const deleted = await this.permissionService.resetOverride(
        guildId,
        commandPath,
        type,
        targetRaw,
      );
      await message.reply(
        makeSuccessCard(
          "Overrides reset",
          `Removed **${deleted}** override${deleted === 1 ? "" : "s"} for \`${commandPath}\`.`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      await message.reply(makeErrorCard("Reset Failed", error.message));
    }
  }

  public async messageRunList(message: Message, args: Args): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const guildId = message.guildId!;
    const settings = await container.db.getAllPermissionOverrides(
      guildId,
      commandPath ?? undefined,
    );
    const title = commandPath
      ? `Overrides for \`${commandPath}\``
      : "Permission Overrides";
    const t = await fetchT(message);
    await message.reply(makeListCard(t, title, settings.map(formatOverride)));
  }

  async #write(message: Message, args: Args, allow: boolean): Promise<void> {
    const commandPath = await args.pick("string").catch(() => null);
    const typeRaw = await args.pick("string").catch(() => null);
    const targetRaw = await args.pick("string").catch(() => null);

    if (!commandPath || !typeRaw) {
      await message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `,permissions [allow|deny] <command_path> <type> [target]`",
        ),
      );
      return;
    }

    const type = typeRaw.toLowerCase() as ModelType;
    if (!MODEL_TYPES.includes(type)) {
      await message.reply(
        makeErrorCard(
          "Invalid Type",
          `Type must be one of: ${MODEL_TYPES.join(", ")}`,
        ),
      );
      return;
    }

    const guildId = message.guildId!;

    try {
      await this.permissionService.addOverride(
        guildId,
        commandPath,
        type,
        targetRaw,
        allow,
      );
      const verb = allow ? "allowed" : "denied";
      await message.reply(
        makeSuccessCard(
          `Override ${verb}`,
          `\`${commandPath}\` is now **${verb}** for ${type === "everyone" ? "@everyone" : `the specified ${type}`}.`,
        ),
      );
    } catch (err: unknown) {
      const error = err as Error;
      await message.reply(makeErrorCard("Invalid target", error.message));
    }
  }
}
