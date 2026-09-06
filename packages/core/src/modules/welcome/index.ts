import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { ChannelType } from "discord.js";
import {
  DmTemplateDocs,
  GoodbyeTemplateDocs,
  WelcomeDefaults,
  WelcomeTemplateDocs,
} from "./lib/config.js";

@DefineModule({
  name: "welcome",
  displayName: "Welcome",
  emoji: "👋",
  description:
    "Greets new members with a welcome card, posts goodbye cards on leave, assigns join roles, and optionally sends a DM greeting.",
  short: "Welcome cards, goodbye cards, join roles, and DM greetings.",
  endUserDataStatement:
    "No persistent user data. Join and leave events are rendered into cards at delivery time and are not stored.",
  category: "Community",
  configSchema: cfg.object({
    welcomeEnabled: cfg.boolean({
      group: "Welcome Message",
      label: "Welcome Message Enabled",
      description: "Post a welcome card when a member joins.",
      default: WelcomeDefaults.welcomeEnabled,
    }),
    welcomeChannel: cfg.channel({
      group: "Welcome Message",
      label: "Welcome Channel",
      description: "Channel where welcome cards are posted.",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    }),
    welcomeTemplate: cfg.string({
      group: "Welcome Message",
      label: "Welcome Template",
      description: `Posted when a member joins. ${WelcomeTemplateDocs}`,
      default: WelcomeDefaults.welcomeTemplate,
    }),
    goodbyeEnabled: cfg.boolean({
      group: "Goodbye Message",
      label: "Goodbye Message Enabled",
      description: "Post a goodbye card when a member leaves.",
      default: WelcomeDefaults.goodbyeEnabled,
    }),
    goodbyeChannel: cfg.channel({
      group: "Goodbye Message",
      label: "Goodbye Channel",
      description: "Channel where goodbye cards are posted.",
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    }),
    goodbyeTemplate: cfg.string({
      group: "Goodbye Message",
      label: "Goodbye Template",
      description: `Posted when a member leaves. ${GoodbyeTemplateDocs}`,
      default: WelcomeDefaults.goodbyeTemplate,
    }),
    autoRoles: cfg.multiRole({
      group: "Join Extras",
      label: "Auto Roles",
      description: "Roles assigned automatically when a member joins.",
      default: [],
    }),
    dmWelcomeEnabled: cfg.boolean({
      group: "Join Extras",
      label: "DM Greeting Enabled",
      description: "Send the new member a DM greeting on join.",
      default: WelcomeDefaults.dmWelcomeEnabled,
    }),
    dmWelcomeTemplate: cfg.string({
      group: "Join Extras",
      label: "DM Greeting Template",
      description: `Sent as a DM to new members. ${DmTemplateDocs}`,
      default: WelcomeDefaults.dmWelcomeTemplate,
    }),
  }),
})
export class WelcomeModule extends Module {
  public override async deleteUserData(_userId: string): Promise<void> {}

  public override exportUserData(
    _userId: string,
  ): Record<string, unknown> | null {
    return null;
  }
}
