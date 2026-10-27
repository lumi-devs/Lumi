import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from "canvas";
import { AttachmentBuilder } from "discord.js";
import path from "path";
import { roundRect } from "@lumi/ui";

const CARD_WIDTH = 934;
const CARD_HEIGHT = 282;

export interface RankCardData {
  username: string;
  discriminator?: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpToNext: number;
  rank: number;
  totalUsers: number;
  guildName?: string;
}

export async function generateRankCard(data: RankCardData): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  
  // Background
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#1e1e2e");
  gradient.addColorStop(1, "#2a2a3e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  
  // Decorative elements
  ctx.fillStyle = "rgba(76, 110, 245, 0.1)";
  ctx.beginPath();
  ctx.arc(CARD_WIDTH - 100, 100, 150, 0, Math.PI * 2);
  ctx.fill();
  
  // Load avatar
  let avatar: any = null;
  try {
    const avatarImg = await loadImage(data.avatarUrl);
    avatar = avatarImg;
  } catch {
    // Use default
  }
  
  // Avatar circle
  const avatarSize = 180;
  const avatarX = 60;
  const avatarY = 51;
  
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
  ctx.clip();
  
  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    // Default avatar
    ctx.fillStyle = "#4c6ef5";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 60px Arial";
    ctx.textAlign = "center";
    ctx.fillText(data.username.charAt(0).toUpperCase(), avatarX + avatarSize/2, avatarY + avatarSize/2 + 20);
  }
  ctx.restore();
  
  // Avatar border
  ctx.strokeStyle = "#4c6ef5";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
  ctx.stroke();
  
  // Username
  ctx.fillStyle = "#fff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "left";
  const username = data.discriminator ? `${data.username}#${data.discriminator}` : data.username;
  ctx.fillText(username, 270, 110);
  
  // Guild name
  if (data.guildName) {
    ctx.fillStyle = "#adb5bd";
    ctx.font = "20px Arial";
    ctx.fillText(data.guildName, 270, 145);
  }
  
  // Rank
  ctx.fillStyle = "#ffd43b";
  ctx.font = "bold 24px Arial";
  ctx.fillText(`Rank #${data.rank} / ${data.totalUsers}`, 270, 185);
  
  // Level
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Arial";
  ctx.fillText(`Level ${data.level}`, 270, 255);
  
  // XP Bar
  const barX = 270;
  const barY = 270;
  const barWidth = 600;
  const barHeight = 20;
  const progress = Math.min(data.xp / (data.xp + data.xpToNext), 1);
  
  // Bar background
  ctx.fillStyle = "#2d2d3d";
  ctx.beginPath();
  roundRect(ctx, barX, barY, barWidth, barHeight, 10);
  ctx.fill();
  
  // Bar progress
  const progressWidth = barWidth * progress;
  if (progressWidth > 0) {
    const barGradient = ctx.createLinearGradient(barX, 0, barX + progressWidth, 0);
    barGradient.addColorStop(0, "#4c6ef5");
    barGradient.addColorStop(1, "#9775fa");
    ctx.fillStyle = barGradient;
    ctx.beginPath();
    roundRect(ctx, barX, barY, Math.max(progressWidth, 20), barHeight, 10);
    ctx.fill();
  }
  
  // XP text
  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`${data.xp.toLocaleString()} / ${(data.xp + data.xpToNext).toLocaleString()} XP`, barX + barWidth - 10, barY + 14);
  
  return canvas.toBuffer("image/png");
}
