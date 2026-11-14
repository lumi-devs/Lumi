import type { Message } from "discord.js";
import type { QuoteAvatarSource, QuoteNameSource } from "./constants.js";

// Installed from manifest requirements at add-on install time, not from the root package.
const rendererSpecifier = "makeitaquote";

export interface QuoteRenderOptions {
  color: boolean;
  watermark: string;
  nameSource: QuoteNameSource;
  avatarSource: QuoteAvatarSource;
  stripMarkdown: boolean;
  resolveMentions: boolean;
}

export type QuoteInput =
  | {
      kind: "message";
      message: Message;
      options: QuoteRenderOptions;
    }
  | {
      kind: "text";
      text: string;
      username: string;
      displayName: string;
      avatarUrl: string;
      options: QuoteRenderOptions;
    };

export interface QuoteRenderer {
  render(input: QuoteInput): Promise<Buffer>;
}

interface LocalMiQClient {
  setFromMessage(
    message: unknown,
    options?: {
      avatar?: QuoteAvatarSource;
      name?: QuoteNameSource;
      markdown?: false | "raw";
      resolveMentions?: boolean;
    },
  ): LocalMiQClient;
  setText(text: string, options?: { markdown?: false | "raw" }): LocalMiQClient;
  setAvatar(avatar: string | URL): LocalMiQClient;
  setUsername(username: string): LocalMiQClient;
  setDisplayName(displayName: string): LocalMiQClient;
  setWatermark(watermark: string): LocalMiQClient;
  setTheme(theme: { avatar: { grayscale: boolean } }): LocalMiQClient;
  toBuffer(format?: "png"): Promise<Buffer>;
}

interface LocalMiQModule {
  MiQ: new () => LocalMiQClient;
  stripDiscordMarkdown?: (text: string) => string;
}

let rendererModulePromise: Promise<LocalMiQModule> | null = null;

async function loadRendererModule(): Promise<LocalMiQModule> {
  rendererModulePromise ??= import(
    rendererSpecifier
  ) as Promise<LocalMiQModule>;
  try {
    return await rendererModulePromise;
  } catch (error) {
    rendererModulePromise = null;
    throw error;
  }
}

export const defaultQuoteRenderer: QuoteRenderer = {
  async render(input) {
    const { MiQ, stripDiscordMarkdown } = await loadRendererModule();
    const miq = new MiQ();

    if (input.kind === "message") {
      miq.setFromMessage(input.message, {
        avatar: input.options.avatarSource,
        name: input.options.nameSource,
        markdown: input.options.stripMarkdown ? false : "raw",
        resolveMentions: input.options.resolveMentions,
      });
    } else {
      const text =
        input.options.stripMarkdown && stripDiscordMarkdown
          ? stripDiscordMarkdown(input.text)
          : input.text;
      miq.setAvatar(input.avatarUrl);
      miq.setText(text);
      miq.setUsername(input.username);
      miq.setDisplayName(input.displayName);
    }

    if (input.options.watermark.trim().length > 0) {
      miq.setWatermark(input.options.watermark);
    }
    miq.setTheme({ avatar: { grayscale: !input.options.color } });

    return miq.toBuffer("png");
  },
};
