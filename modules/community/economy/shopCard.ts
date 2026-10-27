import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";
import { AttachmentBuilder } from "discord.js";
import { roundRect } from "@lumi/ui";

const CARD_WIDTH = 900;
const CARD_HEIGHT = 600;

export interface ShopItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  type: "role" | "item" | "custom";
  roleId?: string;
  currencySymbol: string;
}

export interface ShopCardData {
  guildName: string;
  guildIconUrl: string | null;
  currencyName: string;
  currencySymbol: string;
  items: ShopItemData[];
  page: number;
  totalPages: number;
}

export async function generateShopCard(data: ShopCardData): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Decorative accent
  ctx.fillStyle = "rgba(255, 212, 59, 0.06)";
  ctx.beginPath();
  ctx.arc(CARD_WIDTH - 100, 100, 250, 0, Math.PI * 2);
  ctx.fill();

  // Header background
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  roundRect(ctx, 20, 20, CARD_WIDTH - 40, 80, 15);
  ctx.fill();

  // Guild icon
  let guildIcon: any = null;
  if (data.guildIconUrl) {
    try {
      const iconImg = await loadImage(data.guildIconUrl);
      guildIcon = iconImg;
    } catch {}
  }

  const iconSize = 60;
  const iconX = 40;
  const iconY = 30;

  ctx.save();
  ctx.beginPath();
  ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2, 0, Math.PI * 2);
  ctx.clip();

  if (guildIcon) {
    ctx.drawImage(guildIcon, iconX, iconY, iconSize, iconSize);
  } else {
    ctx.fillStyle = "#ffd43b";
    ctx.fillRect(iconX, iconY, iconSize, iconSize);
    ctx.fillStyle = "#1a1a2e";
    ctx.font = "bold 30px Arial";
    ctx.textAlign = "center";
    ctx.fillText(data.guildName.charAt(0).toUpperCase(), iconX + iconSize/2, iconY + iconSize/2 + 12);
  }
  ctx.restore();

  // Guild icon border
  ctx.strokeStyle = "#ffd43b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2, 0, Math.PI * 2);
  ctx.stroke();

  // Guild name
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.fillText(data.guildName, iconX + iconSize + 20, iconY + 30);

  // Currency info
  ctx.fillStyle = "#adb5bd";
  ctx.font = "16px Arial";
  ctx.fillText(`${data.currencyName} Shop`, iconX + iconSize + 20, iconY + 60);

  // Page indicator
  ctx.fillStyle = "#ffd43b";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`Page ${data.page} / ${data.totalPages}`, CARD_WIDTH - 40, iconY + 55);

  // Items area
  const startY = 130;
  const itemHeight = 90;
  const itemSpacing = 10;
  const maxItemsPerPage = 4;
  const startX = 40;
  const itemWidth = CARD_WIDTH - 80;

  for (let i = 0; i < Math.min(data.items.length, maxItemsPerPage); i++) {
    const item = data.items[i];
    const y = startY + i * (itemHeight + itemSpacing);
    
    drawShopItem(ctx, item, startX, y, itemWidth, itemHeight);
  }

  // Footer
  ctx.fillStyle = "#6c757d";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Lumi Economy • Use /shop buy <item> to purchase", CARD_WIDTH / 2, CARD_HEIGHT - 20);

  return canvas.toBuffer("image/png");
}

function drawShopItem(
  ctx: CanvasRenderingContext2D, 
  item: ShopItemData, 
  x: number, 
  y: number, 
  width: number, 
  height: number
) {
  // Item background
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  roundRect(ctx, x, y, width, height, 12);
  ctx.fill();

  // Item border based on type
  const typeColors: Record<string, string> = {
    role: "#4ade80",
    item: "#4c6ef5",
    custom: "#a855f7",
  };
  const typeColor = typeColors[item.type] || "#ffd43b";

  ctx.strokeStyle = typeColor + "80";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, width, height, 12);
  ctx.stroke();

  // Type badge
  const badgeWidth = 80;
  const badgeHeight = 24;
  const badgeX = x + 20;
  const badgeY = y + 20;

  ctx.fillStyle = typeColor + "30";
  roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();

  ctx.fillStyle = typeColor;
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
  ctx.fillText(typeLabel, badgeX + badgeWidth/2, badgeY + badgeHeight/2 + 4);

  // Item name
  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";
  ctx.fillText(item.name, badgeX + badgeWidth + 20, badgeY + 20);

  // Price
  ctx.fillStyle = "#ffd43b";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`${item.currencySymbol} ${item.price.toLocaleString()}`, x + width - 20, badgeY + 20);

  // Description
  ctx.fillStyle = "#adb5bd";
  ctx.font = "15px Arial";
  ctx.textAlign = "left";
  
  // Truncate description if too long
  const maxDescWidth = width - 160;
  let desc = item.description;
  while (ctx.measureText(desc).width > maxDescWidth && desc.length > 3) {
    desc = desc.slice(0, -1);
  }
  if (desc !== item.description) {
    desc = desc.slice(0, -3) + "...";
  }
  ctx.fillText(desc, badgeX + badgeWidth + 20, badgeY + 50);

  // Role indicator if applicable
  if (item.type === "role" && item.roleId) {
    ctx.fillStyle = "#4ade80";
    ctx.font = "13px Arial";
    ctx.fillText("🎭 Grants role", badgeX + badgeWidth + 20, badgeY + 72);
  }
}
