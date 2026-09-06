import type { ReactNode } from "react";
import { Check, ChevronDown, Hash, Link2, Volume2 } from "lucide-react";
import { cn } from "#/lib/utils";

export const DiscordBg = "#313338";
export const DiscordText = "#b5bac1";
export const DiscordMuted = "#949ba4";
export const DiscordLink = "#00a8fc";
export const DiscordBlurple = "#5865F2";
const DiscordCardBg = "#2b2d31";
const DiscordCodeBg = "#1e1f22";
const DiscordHeading = "#dbdee1";

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
        style={{ backgroundColor: "rgba(88,101,242,0.3)", color: "#c9cdfb" }}
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
        style={{ backgroundColor: "rgba(88,101,242,0.3)", color: "#c9cdfb" }}
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
        if (line.startsWith("## ")) {
          return (
            <span
              key={i}
              className="block text-[15px] font-semibold"
              style={{ color: DiscordHeading }}
            >
              {renderInlineLine(line.slice(3), i)}
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
  secondary: "#4e5058",
  success: "#23a55a",
  danger: "#da373c",
  link: "#4e5058",
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
        style={{ borderColor: "#26272b", boxShadow: "0 1px 0 rgba(0,0,0,0.2)" }}
      >
        <Hash aria-hidden className="size-5 shrink-0" style={{ color: "#80848e" }} />
        <span className="truncate text-[15px] font-bold" style={{ color: "#ffffff" }}>
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
        <Volume2 aria-hidden className="size-4 shrink-0" style={{ color: "#80848e" }} />
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

export function DiscordSeparator() {
  return <div aria-hidden className="my-1 h-px w-full" style={{ backgroundColor: "#3f4147" }} />;
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
      {embed ? (
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
