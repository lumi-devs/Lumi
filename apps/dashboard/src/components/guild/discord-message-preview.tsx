import type { ReactNode } from "react";
import { Check, ChevronDown, Hash, Link2, Volume2 } from "lucide-react";
import { cn } from "#/lib/utils";

// Resolved from the `--discord-*` tokens in globals.css, which carry both of
// Discord's own themes, so the preview follows the dashboard's light/dark
// setting. Blurple is a brand colour and identical in both.
export const DiscordBg = "var(--discord-bg)";
export const DiscordText = "var(--discord-text)";
export const DiscordMuted = "var(--discord-muted)";
export const DiscordLink = "var(--discord-link)";
export const DiscordBlurple = "#5865F2";
const DiscordCardBg = "var(--discord-card-bg)";
const DiscordCodeBg = "var(--discord-code-bg)";
const DiscordHeading = "var(--discord-heading)";
const DiscordChromeBorder = "var(--discord-chrome-border)";
const DiscordChannelIcon = "var(--discord-channel-icon)";
const DiscordMentionBg = "var(--discord-mention-bg)";
const DiscordMentionFg = "var(--discord-mention-fg)";
const DiscordDivider = "var(--discord-divider)";
const DiscordContainerBorder = "var(--discord-container-border)";

const inlinePattern =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|<#[^>\n]+>|<@&?[^>\n]+>|@(?:everyone|here)|#[a-z0-9_-]+|\[[^\]\n]+\]\([^)\n]+\)|https?:\/\/[^\s<]+)/g;

function renderInlineToken(token: string, key: number): ReactNode {
  if (token.startsWith("**") && token.endsWith("**")) {
    return (
      <strong key={key} style={{ color: DiscordHeading }} className="font-semibold">
        {token.slice(2, -2)}
      </strong>
    );
  }
  if (token.startsWith("`") && token.endsWith("`")) {
    return (
      <code
        key={key}
        className="rounded px-1 py-px font-mono text-[13px]"
        style={{ backgroundColor: DiscordCodeBg, color: DiscordHeading }}
      >
        {token.slice(1, -1)}
      </code>
    );
  }
  if (
    (token.startsWith("*") && token.endsWith("*")) ||
    (token.startsWith("_") && token.endsWith("_"))
  ) {
    return <em key={key}>{token.slice(1, -1)}</em>;
  }
  if (token.startsWith("<#") || /^#[a-z0-9_-]+$/i.test(token)) {
    const name = token.startsWith("<#") ? token.slice(2, -1) : token.slice(1);
    return (
      <span
        key={key}
        className="inline-flex items-center gap-0.5 rounded px-1 font-medium"
        style={{ backgroundColor: DiscordMentionBg, color: DiscordMentionFg }}
      >
        <Hash aria-hidden className="size-3" />
        {name}
      </span>
    );
  }
  if (token.startsWith("<@") || token.startsWith("@")) {
    const name = token.startsWith("<@")
      ? token.replace(/^<@&?/, "").replace(/>$/, "")
      : token;
    return (
      <span
        key={key}
        className="rounded px-1 font-medium"
        style={{ backgroundColor: DiscordMentionBg, color: DiscordMentionFg }}
      >
        @{name.replace(/^@/, "")}
      </span>
    );
  }
  const linkMatch = /^\[(.+)\]\((.+)\)$/.exec(token);
  if (linkMatch) {
    const linkText = linkMatch[1] ?? "";
    const safeLinkHref = getSafeHttpUrl(linkMatch[2] ?? "");
    if (safeLinkHref) {
      return (
        <a
          key={key}
          href={safeLinkHref}
          onClick={(e) => e.preventDefault()}
          style={{ color: DiscordLink }}
          className="hover:underline"
        >
          {linkText}
        </a>
      );
    }
    return <span key={key}>{token}</span>;
  }
  const safeTokenHref = /^https?:\/\//.test(token) ? getSafeHttpUrl(token) : null;
  if (safeTokenHref) {
    return (
      <a
        key={key}
        href={safeTokenHref}
        onClick={(e) => e.preventDefault()}
        style={{ color: DiscordLink }}
        className="hover:underline"
      >
        {token}
      </a>
    );
  }
  return <span key={key}>{token}</span>;
}

function getSafeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const inlineTest = new RegExp(inlinePattern.source);

function renderInlineLine(line: string, key: number): ReactNode {
  const parts = line.split(inlinePattern).filter((p) => p !== "");
  return (
    <span key={key}>
      {parts.map((part, i) =>
        inlineTest.test(part) ? (
          renderInlineToken(part, i)
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

/** Discord markdown-lite: headings, subtext, bold, italic, code, channels, mentions, links. */
export function MarkdownLite({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        // Discord sizes its headings well above body text; the bot's card
        // titles are `## `, so rendering them at body size understates them.
        const heading = line.startsWith("### ")
          ? { size: "text-[16px]", skip: 4 }
          : line.startsWith("## ")
            ? { size: "text-[20px]", skip: 3 }
            : line.startsWith("# ")
              ? { size: "text-[24px]", skip: 2 }
              : null;
        if (heading) {
          return (
            <span
              key={i}
              className={cn("mt-1 block font-bold leading-tight", heading.size)}
              style={{ color: DiscordHeading }}
            >
              {renderInlineLine(line.slice(heading.skip), i)}
              {i < text.split("\n").length - 1 ? <br /> : null}
            </span>
          );
        }
        if (line.startsWith("-# ")) {
          return (
            <span key={i} className="block text-[12px]" style={{ color: DiscordMuted }}>
              {renderInlineLine(line.slice(3), i)}
              {i < text.split("\n").length - 1 ? <br /> : null}
            </span>
          );
        }
        return (
          <span key={i}>
            {renderInlineLine(line, i)}
            {i < text.split("\n").length - 1 ? <br /> : null}
          </span>
        );
      })}
    </>
  );
}

export interface PreviewField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface PreviewEmbed {
  accentColor?: string;
  title: string;
  body: string[];
  fields?: PreviewField[];
  footer?: string;
  thumbnailLabel?: string;
}

export interface PreviewButton {
  label: string;
  style?: "primary" | "secondary" | "success" | "danger" | "link";
  disabled?: boolean;
  emoji?: string;
}

const buttonColors: Record<NonNullable<PreviewButton["style"]>, string> = {
  primary: DiscordBlurple,
  secondary: "var(--discord-button-secondary)",
  success: "#23a55a",
  danger: "#da373c",
  link: "var(--discord-button-secondary)",
};

export interface PreviewVoiceRow {
  name: string;
  memberCount?: number;
  userLimit?: number;
  locked?: boolean;
  members?: string[];
}

export function DiscordPreviewShell({
  channelName,
  channelTopic,
  children,
}: {
  channelName: string;
  channelTopic?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ backgroundColor: DiscordBg }}>
      <div
        className="flex h-12 items-center gap-2 border-b px-4"
        style={{ borderColor: DiscordChromeBorder }}
      >
        <Hash aria-hidden className="size-5 shrink-0" style={{ color: DiscordChannelIcon }} />
        <span className="truncate text-[15px] font-bold" style={{ color: DiscordHeading }}>
          {channelName}
        </span>
        {channelTopic ? (
          <span className="hidden truncate text-[13px] sm:block" style={{ color: DiscordMuted }}>
            {channelTopic}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-4 py-4">{children}</div>
    </div>
  );
}

export function DiscordVoiceRow({ row }: { row: PreviewVoiceRow }) {
  const limit = row.userLimit && row.userLimit > 0 ? ` / ${row.userLimit}` : "";
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-1.5 rounded px-2 py-1"
        style={{ color: DiscordMuted }}
      >
        <Volume2 aria-hidden className="size-4 shrink-0" style={{ color: DiscordChannelIcon }} />
        <span className="truncate text-[15px] font-medium">{row.name}</span>
        {row.locked ? <span className="text-[12px]">· locked</span> : null}
        {row.memberCount !== undefined ? (
          <span className="ml-auto text-[12px] tabular">
            {row.memberCount}
            {limit}
          </span>
        ) : null}
      </div>
      {row.members?.map((member) => (
        <div key={member} className="flex items-center gap-2 py-0.5 pr-2 pl-9">
          <span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
            style={{ backgroundColor: DiscordBlurple, color: "#ffffff" }}
          >
            {member.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-[14px]" style={{ color: DiscordText }}>
            {member}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DiscordMessage({
  username,
  roleColor,
  bot,
  timestamp,
  avatarColor,
  body,
}: {
  username: string;
  roleColor?: string;
  bot?: boolean;
  timestamp?: string;
  avatarColor?: string;
  body: ReactNode;
}) {
  return (
    <div className="flex gap-3.5 px-1 py-1">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
        style={{ backgroundColor: avatarColor ?? DiscordBlurple, color: "#ffffff" }}
      >
        {username.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span
            className="text-[15px] font-medium hover:underline"
            style={{ color: roleColor ?? DiscordHeading }}
          >
            {username}
          </span>
          {bot ? (
            <span
              className="rounded px-1 py-px text-[10px] font-medium tracking-wide"
              style={{ backgroundColor: DiscordBlurple, color: "#ffffff" }}
            >
              BOT
            </span>
          ) : null}
          <span className="text-[11px]" style={{ color: DiscordMuted }}>
            {timestamp ?? "Today at 4:20 PM"}
          </span>
        </div>
        <div className="text-[15px] leading-[1.4]" style={{ color: DiscordText }}>
          {body}
        </div>
      </div>
    </div>
  );
}

export function DiscordEmbedCard({ embed }: { embed: PreviewEmbed }) {
  return (
    <div className="my-1 flex max-w-[520px] overflow-hidden rounded-lg" style={{ backgroundColor: DiscordCardBg }}>
      <div className="w-1 shrink-0" style={{ backgroundColor: embed.accentColor ?? DiscordBlurple }} />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold" style={{ color: DiscordHeading }}>
              {embed.title}
            </p>
            {embed.body.map((line, i) => (
              <p key={i} className="mt-1 text-[14px] leading-[1.4]" style={{ color: DiscordText }}>
                <MarkdownLite text={line} />
              </p>
            ))}
          </div>
          {embed.thumbnailLabel ? (
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-lg text-[18px] font-bold"
              style={{ backgroundColor: DiscordBlurple, color: "#ffffff" }}
            >
              {embed.thumbnailLabel.slice(0, 1).toUpperCase()}
            </span>
          ) : null}
        </div>
        {embed.fields && embed.fields.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {embed.fields.map((field) => (
              <div key={field.name} className={cn(!field.inline && "col-span-2")}>
                <p className="text-[12px] font-semibold" style={{ color: DiscordHeading }}>
                  {field.name}
                </p>
                <p className="text-[14px]" style={{ color: DiscordText }}>
                  <MarkdownLite text={field.value} />
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {embed.footer ? (
          <p className="mt-2 text-[12px]" style={{ color: DiscordMuted }}>
            {embed.footer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DiscordSelectMenu({ placeholder }: { placeholder: string }) {
  return (
    <div
      className="my-1 flex max-w-[520px] items-center justify-between rounded px-3 py-2 text-[14px]"
      style={{ backgroundColor: DiscordCardBg, color: DiscordText }}
    >
      <span className="truncate">{placeholder}</span>
      <ChevronDown aria-hidden className="size-4 shrink-0" style={{ color: DiscordMuted }} />
    </div>
  );
}

export function DiscordButtonRow({ buttons }: { buttons: PreviewButton[] }) {
  return (
    <div className="my-1 flex max-w-[520px] flex-wrap gap-2">
      {buttons.map((button) => (
        <span
          key={button.label}
          aria-disabled={button.disabled}
          className={cn(
            "inline-flex h-8 min-h-8 items-center gap-1.5 rounded-[3px] px-4 text-[14px] font-medium",
            button.disabled && "cursor-not-allowed opacity-50",
          )}
          style={{ backgroundColor: buttonColors[button.style ?? "secondary"], color: "#ffffff" }}
        >
          {button.style === "link" ? <Link2 aria-hidden className="size-3.5" /> : null}
          {button.emoji ? (
            <span aria-hidden>{button.emoji}</span>
          ) : button.style === "success" && !button.disabled ? (
            <Check aria-hidden className="size-3.5" />
          ) : null}
          {button.label}
        </span>
      ))}
    </div>
  );
}

export function DiscordMessagePreview({
  channelName,
  channelTopic,
  voiceRows,
  username,
  roleColor,
  timestamp,
  avatarColor,
  body,
  embed,
  container,
  selectPlaceholder,
  buttons,
}: {
  channelName: string;
  channelTopic?: string;
  voiceRows?: PreviewVoiceRow[];
  username?: string;
  roleColor?: string;
  timestamp?: string;
  avatarColor?: string;
  body?: string;
  embed?: PreviewEmbed;
  /** A Components V2 container - what the bot actually sends. */
  container?: PreviewContainer;
  selectPlaceholder?: string;
  buttons?: PreviewButton[];
}) {
  const hasMessage = body !== undefined;
  const embedIndent = hasMessage ? "pl-[54px]" : undefined;
  return (
    <DiscordPreviewShell channelName={channelName} channelTopic={channelTopic}>
      {voiceRows?.map((row) => <DiscordVoiceRow key={row.name} row={row} />)}
      {hasMessage ? (
        <DiscordMessage
          username={username ?? "Lumi"}
          roleColor={roleColor}
          bot
          timestamp={timestamp}
          avatarColor={avatarColor}
          body={<MarkdownLite text={body} />}
        />
      ) : null}
      {container ? (
        <div className={embedIndent}>
          {/* V2 action rows live inside the container, not beneath it. */}
          <DiscordContainerCard
            container={{
              ...container,
              components: [
                ...container.components,
                ...(selectPlaceholder
                  ? [{ kind: "select" as const, placeholder: selectPlaceholder }]
                  : []),
                ...(buttons ? [{ kind: "buttons" as const, buttons }] : []),
              ],
            }}
          />
        </div>
      ) : embed ? (
        <div className={embedIndent}>
          <DiscordEmbedCard embed={embed} />
          {selectPlaceholder ? <DiscordSelectMenu placeholder={selectPlaceholder} /> : null}
          {buttons ? <DiscordButtonRow buttons={buttons} /> : null}
        </div>
      ) : (
        <>
          {selectPlaceholder ? (
            <div className={embedIndent}>
              <DiscordSelectMenu placeholder={selectPlaceholder} />
            </div>
          ) : null}
          {buttons ? (
            <div className={embedIndent}>
              <DiscordButtonRow buttons={buttons} />
            </div>
          ) : null}
        </>
      )}
    </DiscordPreviewShell>
  );
}

/**
 * One component inside a Components V2 container, mirroring what
 * `buildContainer` in the bot's `lib/utilities/cards.ts` actually assembles.
 */
export type PreviewV2Component =
  | { kind: "text"; content: string }
  | { kind: "separator"; divider?: boolean }
  | { kind: "buttons"; buttons: PreviewButton[] }
  | { kind: "select"; placeholder: string }
  | { kind: "media"; imageUrls: string[] }
  /** A standalone Components V2 `Section`: 1-3 text bodies plus an
   * accessory (a small thumbnail, or a single button) rendered beside
   * them — the block builder's Section block. */
  | {
      kind: "section";
      texts: string[];
      accessory?:
        | { type: "thumbnail"; url: string }
        | { type: "button"; button: PreviewButton };
    };

export interface PreviewContainer {
  accentColor?: string;
  components: PreviewV2Component[];
  /** Small image shown beside the leading text components, mirroring
   * `buildContainer`'s `SectionBuilder` + `ThumbnailBuilder` pairing. */
  thumbnailUrl?: string;
}

/** A Components V2 media gallery — what `MediaGalleryBuilder` renders on the
 * real card. Broken/empty URLs fall back to a placeholder tile rather than a
 * broken-image icon, since these are unvalidated user input in the editor. */
export function DiscordMediaGallery({ imageUrls }: { imageUrls: string[] }) {
  const urls = imageUrls.filter((u) => u.length > 0).slice(0, 10);
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="aspect-square overflow-hidden rounded-md"
          style={{ backgroundColor: DiscordCodeBg }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URLs, not a Next-optimizable local asset */}
          <img
            src={url}
            alt=""
            className="size-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * A Components V2 container, which is what the bot sends — not an embed.
 * The visible differences matter: `##` is a real heading rather than an embed
 * title, `-#` is subtext, separators are drawn rules, and the accent is a
 * stripe on a full-width container rather than an embed's left bar.
 */
export function DiscordContainerCard({ container }: { container: PreviewContainer }) {
  // Mirrors `buildContainer`: when a thumbnail is set, the leading text
  // components (max 3) pair with it as one section instead of stacking full
  // width, and everything after renders below as usual.
  const thumbSplit = container.thumbnailUrl ? 3 : 0;
  let textsSeen = 0;
  const components = container.components.flatMap((component, i) => {
    if (thumbSplit > 0 && component.kind === "text" && textsSeen < thumbSplit) {
      textsSeen += 1;
      return [{ ...component, _thumbnailPaired: true, _key: i }];
    }
    return [{ ...component, _key: i }];
  });
  const sectionParts = components.filter(
    (c): c is Extract<PreviewV2Component, { kind: "text" }> & { _key: number } =>
      "_thumbnailPaired" in c && c._thumbnailPaired === true,
  );
  const rest = components.filter((c) => !("_thumbnailPaired" in c));

  return (
    <div
      className="my-1 flex max-w-[520px] overflow-hidden rounded-lg border"
      style={{ backgroundColor: DiscordCardBg, borderColor: DiscordContainerBorder }}
    >
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: container.accentColor ?? DiscordBlurple }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        {container.thumbnailUrl && sectionParts.length > 0 ? (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {sectionParts.map((part) => (
                <p key={part._key} className="text-[14px] leading-[1.4]" style={{ color: DiscordText }}>
                  <MarkdownLite text={part.content} />
                </p>
              ))}
            </div>
            <div
              className="size-16 shrink-0 overflow-hidden rounded-md"
              style={{ backgroundColor: DiscordCodeBg }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL */}
              <img
                src={container.thumbnailUrl}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </div>
        ) : null}
        {rest.map((component, i) => {
          if (component.kind === "separator") {
            return component.divider === false ? (
              <div key={i} className="h-1" />
            ) : (
              <hr key={i} className="border-0 border-t" style={{ borderColor: DiscordDivider }} />
            );
          }
          if (component.kind === "buttons") {
            return <DiscordButtonRow key={i} buttons={component.buttons} />;
          }
          if (component.kind === "select") {
            return <DiscordSelectMenu key={i} placeholder={component.placeholder} />;
          }
          if (component.kind === "media") {
            return <DiscordMediaGallery key={i} imageUrls={component.imageUrls} />;
          }
          if (component.kind === "section") {
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {component.texts.map((text, j) => (
                    <p key={j} className="text-[14px] leading-[1.4]" style={{ color: DiscordText }}>
                      <MarkdownLite text={text} />
                    </p>
                  ))}
                </div>
                {component.accessory?.type === "thumbnail" ? (
                  <div
                    className="size-16 shrink-0 overflow-hidden rounded-md"
                    style={{ backgroundColor: DiscordCodeBg }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL */}
                    <img
                      src={component.accessory.url}
                      alt=""
                      className="size-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                ) : component.accessory?.type === "button" ? (
                  <DiscordButtonRow buttons={[component.accessory.button]} />
                ) : null}
              </div>
            );
          }
          return (
            <p key={i} className="text-[14px] leading-[1.4]" style={{ color: DiscordText }}>
              <MarkdownLite text={component.content} />
            </p>
          );
        })}
      </div>
    </div>
  );
}
