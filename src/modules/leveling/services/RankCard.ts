import type { OverlayOptions } from "sharp";
import { Semaphore } from "#src/lib/utilities/Concurrency.js";

const avatarFetch = new Semaphore(4);
const avatarCache = new Map<string, { buf: Buffer; expires: number }>();

export interface RankCardData {
  username: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  xpNeeded: number;
  rank: number | null;
  messageCount: number;
  voiceMinutes: number;
  accent: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatVoiceMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${h}h` : `${h}h ${restMinutes}m`;
}

async function fetchAvatar(url: string | null): Promise<Buffer | null> {
  return fetchCircleAvatar(url, 160);
}

export async function fetchCircleAvatar(
  url: string | null,
  size: number,
): Promise<Buffer | null> {
  if (!url) return null;
  const key = `${url}:${size}`;
  const hit = avatarCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.buf;
  return avatarFetch.run(async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const raw = Buffer.from(await res.arrayBuffer());
      const radius = size / 2;
      const circle = Buffer.from(
        `<svg width="${size}" height="${size}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/></svg>`,
      );
      const sharp = (await import("sharp")).default;
      const buf = await sharp(raw)
        .resize(size, size, { fit: "cover" })
        .composite([{ input: circle, blend: "dest-in" }])
        .png()
        .toBuffer();
      if (avatarCache.size >= 500) avatarCache.delete(avatarCache.keys().next().value!);
      avatarCache.set(key, { buf, expires: Date.now() + 600_000 });
      return buf;
    } catch {
      return null;
    }
  });
}

export async function renderRankCard(data: RankCardData): Promise<Buffer> {
  const width = 900;
  const height = 300;
  const progress = Math.min(
    1,
    Math.max(0, data.xpNeeded > 0 ? data.xp / data.xpNeeded : 0),
  );
  const barWidth = 560;
  const fillWidth = Math.max(8, Math.floor(barWidth * progress));
  const name = escapeXml(
    data.username.length > 22
      ? `${data.username.slice(0, 21)}…`
      : data.username,
  );

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1d29"/>
      <stop offset="1" stop-color="#252a3d"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${data.accent}"/>
      <stop offset="1" stop-color="#8b9dff"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
  <rect width="10" height="${height}" fill="${data.accent}"/>
  ${data.avatarUrl ? "" : `<circle cx="130" cy="130" r="80" fill="${data.accent}" opacity="0.35"/><text x="130" y="158" font-family="sans-serif" font-size="72" font-weight="bold" fill="#ffffff" text-anchor="middle">${name.charAt(0).toUpperCase()}</text>`}
  <text x="240" y="92" font-family="sans-serif" font-size="44" font-weight="bold" fill="#ffffff">${name}</text>
  <text x="240" y="130" font-family="sans-serif" font-size="24" fill="#9aa3b8">LEVEL ${data.level}${data.rank !== null ? `  ·  RANK #${data.rank}` : ""}</text>
  <rect x="240" y="152" width="${barWidth}" height="30" rx="15" fill="#10131c"/>
  <rect x="240" y="152" width="${fillWidth}" height="30" rx="15" fill="url(#bar)"/>
  <text x="240" y="208" font-family="sans-serif" font-size="22" fill="#c6cde0">${data.xp.toLocaleString("en-US")} / ${data.xpNeeded.toLocaleString("en-US")} XP</text>
  <text x="240" y="248" font-family="sans-serif" font-size="22" fill="#9aa3b8">${data.messageCount.toLocaleString("en-US")} messages   ·   ${formatVoiceMinutes(data.voiceMinutes)} in voice</text>
</svg>`;

  const layers: OverlayOptions[] = [
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];
  const avatar = await fetchAvatar(data.avatarUrl);
  if (avatar) layers.push({ input: avatar, left: 50, top: 50 });

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
