import { checkModulesEnabled } from "#lib/module-check.js";
import { PermissionsBitField, type Message } from "discord.js";

export async function isModuleEnabled(
  guildId: string,
  module: string,
): Promise<boolean> {
  const states = await checkModulesEnabled(guildId, [module]);
  return states.get(module) ?? false;
}

export function canSendMessages(message: Message<true>): boolean {
  const me = message.guild.members.me;
  if (!me) return false;
  return (
    message.channel
      .permissionsFor(me)
      ?.has(PermissionsBitField.Flags.SendMessages) ?? false
  );
}
