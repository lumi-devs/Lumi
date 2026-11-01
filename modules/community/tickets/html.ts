export interface TranscriptAttachment {
  name: string;
  url: string;
  size?: number;
  contentType?: string | null;
}

export interface TranscriptMessage {
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date | string;
  attachments?: unknown;
}

export interface TranscriptNote {
  authorId: string;
  content: string;
  createdAt: Date | string;
}

export interface TranscriptData {
  ticketId: string;
  guildId: string;
  guildName?: string | null;
  categoryName?: string | null;
  userId: string;
  subject?: string | null;
  status: string;
  priority: string;
  claimedBy?: string | null;
  closeReason?: string | null;
  closedBy?: string | null;
  createdAt: Date | string;
  closedAt?: Date | string | null;
  messages: readonly TranscriptMessage[];
  notes: readonly TranscriptNote[];
}

const EscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => EscapeMap[char] ?? char);
}

const EntityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&#x27;": "'",
};

function decodeEscapedHtml(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|apos|#x27);/g,
    (entity) => EntityMap[entity] ?? entity,
  );
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function normalizeAttachments(value: unknown): TranscriptAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      name: String(entry.name ?? "attachment"),
      url: String(entry.url ?? ""),
      ...(typeof entry.size === "number" ? { size: entry.size } : {}),
      contentType:
        typeof entry.contentType === "string" ? entry.contentType : null,
    }))
    .filter((entry) => entry.url.length > 0);
}

function attachmentList(attachments: unknown): string {
  const items = normalizeAttachments(attachments);
  if (items.length === 0) return "";
  const links = items
    .map((attachment) => {
      const href = /^https?:\/\//i.test(attachment.url) ? attachment.url : "#";
      return `<li><a href="${escapeHtml(href)}" rel="noreferrer noopener">${escapeHtml(attachment.name)}</a>${
        attachment.size
          ? ` <span class="muted">(${attachment.size} bytes)</span>`
          : ""
      }</li>`;
    })
    .join("");
  return `<ul class="attachments">${links}</ul>`;
}

const Styles = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; background: #101218; color: #e6e8ef; font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 980px; margin: 0 auto; }
h1 { margin: 0 0 4px; font-size: 26px; }
h2 { margin: 32px 0 12px; font-size: 18px; border-bottom: 1px solid #2b2f3c; padding-bottom: 8px; }
.muted { color: #9299ad; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px 24px; margin: 20px 0; }
.meta { background: #171a22; border: 1px solid #262b38; border-radius: 10px; padding: 16px; }
.meta dt { color: #9299ad; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.meta dd { margin: 2px 0 10px; overflow-wrap: anywhere; }
.message { background: #171a22; border: 1px solid #262b38; border-left: 3px solid #5865f2; border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
.message .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 6px; }
.message .author { font-weight: 700; }
.message .content { white-space: pre-wrap; overflow-wrap: anywhere; }
.note { background: #221d15; border: 1px solid #4b3b20; border-left: 3px solid #d8a13b; border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
.attachments { margin: 8px 0 0; padding-left: 20px; }
a { color: #8ea1ff; }
.empty { color: #9299ad; font-style: italic; }
`.trim();

export function renderTranscript(data: TranscriptData): string {
  const title = `Ticket ${data.ticketId}`;
  const metadata: Array<[string, string]> = [
    ["Ticket ID", data.ticketId],
    [
      "Guild",
      data.guildName ? `${data.guildName} (${data.guildId})` : data.guildId,
    ],
    ["Category", data.categoryName ?? "None"],
    ["Opener", data.userId],
    ["Subject", data.subject ?? "No subject"],
    ["Status", data.status],
    ["Priority", data.priority],
    ["Claimed by", data.claimedBy ?? "Unclaimed"],
    ["Created", formatDate(data.createdAt)],
    ["Closed", formatDate(data.closedAt)],
    ["Closed by", data.closedBy ?? "—"],
    ["Close reason", data.closeReason ?? "—"],
  ];

  const metaHtml = metadata
    .map(
      ([label, value]) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`,
    )
    .join("");

  const notesHtml =
    data.notes.length === 0
      ? `<p class="empty">No staff notes.</p>`
      : data.notes
          .map(
            (note) => `<div class="note">
  <div class="head"><span class="author">${escapeHtml(note.authorId)}</span><span class="muted">${escapeHtml(formatDate(note.createdAt))}</span></div>
  <div class="content">${escapeHtml(decodeEscapedHtml(note.content))}</div>
</div>`,
          )
          .join("\n");

  const messagesHtml =
    data.messages.length === 0
      ? `<p class="empty">No messages were archived.</p>`
      : data.messages
          .map(
            (message) => `<article class="message">
  <div class="head"><span class="author">${escapeHtml(message.authorName)}</span><span class="muted">${escapeHtml(message.authorId)} · ${escapeHtml(formatDate(message.createdAt))}</span></div>
  <div class="content">${escapeHtml(decodeEscapedHtml(message.content))}</div>
  ${attachmentList(message.attachments)}
</article>`,
          )
          .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>${Styles}</style>
</head>
<body>
<main>
<h1>🎫 ${escapeHtml(title)}</h1>
<p class="muted">Escaped transcript generated by Lumi. User-supplied content is rendered as plain text.</p>
<dl class="grid meta">${metaHtml}</dl>
<h2>Staff notes</h2>
${notesHtml}
<h2>Messages (${data.messages.length})</h2>
${messagesHtml}
</main>
</body>
</html>
`;
}
