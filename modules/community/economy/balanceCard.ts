import { roundRect } from "@lumi/ui";
import { createCanvas, loadImage, } from "canvas";

const CARD_WIDTH = 800;
const CARD_HEIGHT = 400;

export interface BalanceCardData {
  username: string;
  avatarUrl: string;
  balance: string;
  bankBalance: string;
  currencySymbol: string;
  currencyName: string;
  totalEarned?: string;
  totalSpent?: string;
}

export async function generateBalanceCard(data: BalanceCardData): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Decorative accent
  ctx.fillStyle = "rgba(76, 110, 245, 0.08)";
  ctx.beginPath();
  ctx.arc(CARD_WIDTH - 80, 80, 200, 0, Math.PI * 2);
  ctx.fill();

  // Load avatar
  let avatar: any = null;
  try {
    const avatarImg = await loadImage(data.avatarUrl);
    avatar = avatarImg;
  } catch {}

  // Avatar circle
  const avatarSize = 120;
  const avatarX = 40;
  const avatarY = (CARD_HEIGHT - avatarSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
  ctx.clip();

  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = "#4c6ef5";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 50px Arial";
    ctx.textAlign = "center";
    ctx.fillText(data.username.charAt(0).toUpperCase(), avatarX + avatarSize/2, avatarY + avatarSize/2 + 18);
  }
  ctx.restore();

  // Avatar border
  ctx.strokeStyle = "#4c6ef5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
  ctx.stroke();

  // Username
  ctx.fillStyle = "#fff";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "left";
  ctx.fillText(data.username, avatarX + avatarSize + 30, avatarY + 50);

  // Currency name
  ctx.fillStyle = "#adb5bd";
  ctx.font = "18px Arial";
  ctx.fillText(`${data.currencyName} Balance`, avatarX + avatarSize + 30, avatarY + 85);

  // Wallet balance
  const walletX = avatarX + avatarSize + 30;
  const walletY = avatarY + 130;
  const boxWidth = 340;
  const boxHeight = 90;

  // Wallet box
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, walletX, walletY, boxWidth, boxHeight, 15);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial";
  ctx.fillText("💰 WALLET", walletX + 20, walletY + 30);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`${data.currencySymbol} ${data.balance}`, walletX + 20, walletY + 70);

  // Bank box
  const bankX = walletX + boxWidth + 20;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, bankX, walletY, boxWidth, boxHeight, 15);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial";
  ctx.fillText("🏦 BANK", bankX + 20, walletY + 30);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`${data.currencySymbol} ${data.bankBalance}`, bankX + 20, walletY + 70);

  // Stats row
  const statsY = walletY + boxHeight + 30;
  const statWidth = (CARD_WIDTH - 80 - 30) / 2;

  // Total earned
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 40, statsY, statWidth, 70, 12);
  ctx.fill();

  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 14px Arial";
  ctx.fillText("📈 TOTAL EARNED", 55, statsY + 30);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.fillText(data.totalEarned ? `${data.currencySymbol} ${data.totalEarned}` : "—", 55, statsY + 60);

  // Total spent
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 40 + statWidth + 20, statsY, statWidth, 70, 12);
  ctx.fill();

  ctx.fillStyle = "#f87171";
  ctx.font = "bold 14px Arial";
  ctx.fillText("📉 TOTAL SPENT", 40 + statWidth + 35, statsY + 30);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px Arial";
  ctx.fillText(data.totalSpent ? `${data.currencySymbol} ${data.totalSpent}` : "—", 40 + statWidth + 35, statsY + 60);

  // Footer
  ctx.fillStyle = "#6c757d";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Lumi Economy", CARD_WIDTH / 2, CARD_HEIGHT - 20);

  return canvas.toBuffer("image/png");
}
