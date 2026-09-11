import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { ChannelType } from "discord.js";
import { MessageTemplateVars } from "#lib/message-content.js";
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
      format: "template",
      templateVars: MessageTemplateVars.map((v) => v.name),
      richPreview: {
        accentColorKey: "welcomeAccentColor",
        footerKey: "welcomeFooter",
        imageUrlsKey: "welcomeImageUrls",
        thumbnailKey: "welcomeThumbnailUrl",
      },
    }),
    welcomeAccentColor: cfg.string({
      group: "Welcome Message",
      label: "Accent Color",
      description: "Accent bar color for the welcome card as hex (e.g. #5865F2).",
      format: "color",
    }),
    welcomeThumbnailUrl: cfg.string({
      group: "Welcome Message",
      label: "Thumbnail",
      description: "Small image shown beside the welcome text. Image URL.",
      format: "image",
    }),
    welcomeImageUrls: cfg.stringList({
      group: "Welcome Message",
      label: "Images",
      description: "Image URLs shown as a gallery on the welcome card (max 10).",
      default: [],
    }),
    welcomeFooter: cfg.string({
      group: "Welcome Message",
      label: "Footer",
      description:
        "Small footer line under the welcome card. Falls back to the auto-role line when empty.",
    }),
    welcomeRichContent: cfg.componentsV2Blocks({
      group: "Welcome Message",
      label: "Advanced Layout",
      description:
        "Optional block-based layout (Section, Media Gallery, Separator, Action Row) for the welcome card. When it has any blocks, it replaces the plain template and rich fields above.",
      templateVars: MessageTemplateVars.map((v) => v.name),
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
      format: "template",
      templateVars: MessageTemplateVars.map((v) => v.name),
    }),
    goodbyeRichContent: cfg.componentsV2Blocks({
      group: "Goodbye Message",
      label: "Advanced Layout",
      description:
        "Optional block-based layout (Section, Media Gallery, Separator, Action Row) for the goodbye card. When it has any blocks, it replaces the plain template above.",
      templateVars: MessageTemplateVars.map((v) => v.name),
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
      format: "template",
      templateVars: MessageTemplateVars.map((v) => v.name),
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
