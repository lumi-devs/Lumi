import type { OverlayOptions } from "sharp";
import { fetchCircleAvatar } from "#src/modules/leveling/services/RankCard.js";
import { Semaphore } from "#src/lib/utilities/Concurrency.js";

const boardFetch = new Semaphore(4);

export interface BoardCardRow {
  rank: number;
  username: string;
  avatarUrl: string | null;
  line1: string;
  line2: string;
  right1: string;
  right2: string;
  progress: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cutName(value: string): string {
  return escapeXml(value.length > 20 ? `${value.slice(0, 19)}…` : value);
}

export async function renderLeaderboardCard(opts: {
  title: string;
  subtitle: string;
  rows: BoardCardRow[];
  accent: string;
  footer: string;
}): Promise<Buffer> {
  const width = 800;
  const rowH = 88;
  const headerH = 108;
  const footerH = 44;
  const height = headerH + opts.rows.length * rowH + footerH;
  const barMax = width - 190;

  const rowSvg = opts.rows
    .map((row, i) => {
      const y = headerH + i * rowH;
      const fill = Math.max(
        6,
        Math.floor(barMax * Math.min(1, Math.max(0, row.progress))),
      );
      return `<text x="24" y="${y + 42}" font-family="sans-serif" font-size="26" font-weight="bold" fill="#7c8499">#${row.rank}</text>
  <text x="150" y="${y + 30}" font-family="sans-serif" font-size="27" font-weight="bold" fill="#ffffff">${cutName(row.username)}</text>
  <text x="150" y="${y + 56}" font-family="sans-serif" font-size="19" fill="#9aa3b8">${escapeXml(row.line1)}${row.line2 ? `  ·  ${escapeXml(row.line2)}` : ""}</text>
  <text x="${width - 24}" y="${y + 30}" font-family="sans-serif" font-size="19" font-weight="bold" fill="#ffffff" text-anchor="end">${escapeXml(row.right1)}</text>
  <text x="${width - 24}" y="${y + 56}" font-family="sans-serif" font-size="18" fill="#9aa3b8" text-anchor="end">${escapeXml(row.right2)}</text>
  <rect x="150" y="${y + 64}" width="${barMax}" height="7" rx="3.5" fill="#10131c"/>
  <rect x="150" y="${y + 64}" width="${fill}" height="7" rx="3.5" fill="${opts.accent}"/>`;
    })
    .join("\n");

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1d29"/>
      <stop offset="1" stop-color="#252a3d"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
  <rect width="10" height="${height}" fill="${opts.accent}"/>
  <text x="36" y="52" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff">${escapeXml(opts.title)}</text>
  <text x="36" y="82" font-family="sans-serif" font-size="20" fill="#9aa3b8">${escapeXml(opts.subtitle)}</text>
  ${rowSvg}
  <text x="36" y="${height - 16}" font-family="sans-serif" font-size="18" fill="#7c8499">${escapeXml(opts.footer)}</text>
</svg>`;

  const layers: OverlayOptions[] = [
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];
  const avatars = await Promise.all(
    opts.rows.map((row) => boardFetch.run(() => fetchCircleAvatar(row.avatarUrl, 56))),
  );
  avatars.forEach((avatar, i) => {
    if (avatar)
      layers.push({ input: avatar, left: 82, top: headerH + i * rowH + 8 });
  });

  const sharp = (await import("sharp")).default;
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
