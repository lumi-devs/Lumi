import { roundRect } from "@lumi/ui";
import {
  createCanvas,
  type CanvasRenderingContext2D,
  type Image,
  loadImage,
} from "canvas";
import type { Lookback } from "./constants.js";

export const StatsCardWidth = 1280;
export const StatsCardHeight = 900;

export interface StatRow {
  label: string;
  value: string;
}

export interface StatBox {
  title: string;
  icon?: string;
  rows: StatRow[];
  big?: {
    value: string;
    label: string;
  };
}

export interface ListItem {
  label: string;
  value: string;
  icon?: string;
}

export interface ListPanel {
  title: string;
  icon?: string;
  items: ListItem[];
}

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

export interface ChartPanel {
  title: string;
  series: ChartSeries[];
  labels: string[];
  stacked?: boolean;
}

export interface HeaderBadge {
  label: string;
  value: string;
}

export interface StatsCardPayload {
  title: string;
  subtitle: string;
  iconUrl?: string;
  badges: HeaderBadge[];
  boxes: StatBox[];
  lists: ListPanel[];
  chart?: ChartPanel;
  lookback: Lookback;
  footer?: string;
  view: "overview" | "chart";
}

const Colors = {
  background: "#080d1a",
  backgroundEnd: "#0e1730",
  panel: "#141b2d",
  panelSoft: "#101625",
  row: "#0c121f",
  border: "#26314a",
  grid: "#232d43",
  text: "#f4f7ff",
  muted: "#8ea0bd",
  dim: "#5e6f8b",
  blue: "#3b82f6",
  cyan: "#22d3ee",
  violet: "#8b5cf6",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#f59e0b",
  red: "#ef4444",
} as const;

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function drawLumiLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const cx = x + size / 2;
  const top = y;
  const bottom = y + size;
  const gradient = ctx.createLinearGradient(x, top, x + size, bottom);
  gradient.addColorStop(0, "#67e8f9");
  gradient.addColorStop(0.5, "#3b82f6");
  gradient.addColorStop(1, "#8b5cf6");

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, top + size * 0.04);
  ctx.bezierCurveTo(
    cx + size * 0.12,
    top + size * 0.2,
    x + size * 0.86,
    y + size * 0.55,
    x + size * 0.86,
    y + size * 0.7,
  );
  ctx.bezierCurveTo(
    x + size * 0.86,
    y + size * 0.92,
    x + size * 0.68,
    bottom,
    cx,
    bottom,
  );
  ctx.bezierCurveTo(
    x + size * 0.32,
    bottom,
    x + size * 0.14,
    y + size * 0.92,
    x + size * 0.14,
    y + size * 0.7,
  );
  ctx.bezierCurveTo(
    x + size * 0.14,
    y + size * 0.55,
    cx - size * 0.12,
    top + size * 0.2,
    cx,
    top + size * 0.04,
  );
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = "#07101f";
  const eyeY = y + size * 0.63;
  const eyeR = Math.max(1.5, size * 0.045);
  ctx.beginPath();
  ctx.arc(cx - size * 0.17, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.17, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#07101f";
  ctx.lineWidth = Math.max(1.5, size * 0.035);
  ctx.beginPath();
  ctx.arc(cx, eyeY + size * 0.05, size * 0.11, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(
    0,
    0,
    StatsCardWidth,
    StatsCardHeight,
  );
  gradient.addColorStop(0, Colors.background);
  gradient.addColorStop(1, Colors.backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, StatsCardWidth, StatsCardHeight);

  const glow = ctx.createRadialGradient(1060, 40, 0, 1060, 40, 520);
  glow.addColorStop(0, "rgba(59,130,246,0.24)");
  glow.addColorStop(1, "rgba(59,130,246,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, StatsCardWidth, StatsCardHeight);

  const second = ctx.createRadialGradient(120, 820, 0, 120, 820, 420);
  second.addColorStop(0, "rgba(139,92,246,0.14)");
  second.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = second;
  ctx.fillRect(0, 0, StatsCardWidth, StatsCardHeight);

  ctx.strokeStyle = "rgba(34,211,238,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < StatsCardWidth; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, StatsCardHeight);
    ctx.stroke();
  }
}

async function loadIcon(url: string | undefined): Promise<Image | null> {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  payload: StatsCardPayload,
  icon: Image | null,
): void {
  drawLumiLogo(ctx, 36, 26, 64);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = Colors.cyan;
  ctx.font = "bold 14px Arial";
  ctx.fillText("L U M I   S T A T S", 118, 48);

  ctx.fillStyle = Colors.text;
  ctx.font = "bold 34px Arial";
  ctx.fillText(fitText(ctx, payload.title, 520), 118, 84);

  ctx.fillStyle = Colors.muted;
  ctx.font = "18px Arial";
  ctx.fillText(fitText(ctx, payload.subtitle, 520), 118, 110);

  if (icon) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(1200, 58, 30, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(icon, 1170, 28, 60, 60);
    ctx.restore();
  }

  const badgeWidth = 170;
  const badgeHeight = 54;
  const right = icon ? 1150 : 1218;
  payload.badges.slice(0, 2).forEach((badge, index) => {
    const x = right - (index + 1) * (badgeWidth + 12);
    fillRoundRect(
      ctx,
      x,
      index === 0 ? 20 : 20,
      badgeWidth,
      badgeHeight,
      10,
      "rgba(255,255,255,0.06)",
    );
    ctx.fillStyle = Colors.muted;
    ctx.font = "12px Arial";
    ctx.fillText(badge.label.toUpperCase(), x + 14, 40);
    ctx.fillStyle = Colors.text;
    ctx.font = "bold 16px Arial";
    ctx.fillText(fitText(ctx, badge.value, badgeWidth - 24), x + 14, 62);
  });
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  box: StatBox,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  fillRoundRect(ctx, x, y, width, height, 16, Colors.panel);
  strokeRoundRect(ctx, x, y, width, height, 16, Colors.border);

  ctx.textAlign = "left";
  ctx.fillStyle = Colors.text;
  ctx.font = "bold 21px Arial";
  ctx.fillText(fitText(ctx, box.title, width - 70), x + 18, y + 32);

  if (box.icon) {
    ctx.textAlign = "right";
    ctx.fillStyle = Colors.muted;
    ctx.font = "22px Arial";
    ctx.fillText(box.icon, x + width - 18, y + 33);
    ctx.textAlign = "left";
  }

  if (box.big) {
    ctx.textAlign = "center";
    ctx.fillStyle = Colors.text;
    ctx.font = "bold 48px Arial";
    ctx.fillText(box.big.value, x + width / 2, y + 112);
    ctx.fillStyle = Colors.muted;
    ctx.font = "italic 22px Arial";
    ctx.fillText(box.big.label, x + width / 2, y + 146);
    ctx.textAlign = "left";
    return;
  }

  const rowHeight = 34;
  const rowGap = 8;
  const rowsTop = y + 48;
  box.rows.slice(0, 4).forEach((row, index) => {
    const rowY = rowsTop + index * (rowHeight + rowGap);
    fillRoundRect(ctx, x + 14, rowY, width - 28, rowHeight, 8, Colors.row);
    fillRoundRect(
      ctx,
      x + 14,
      rowY,
      62,
      rowHeight,
      8,
      "rgba(255,255,255,0.06)",
    );
    ctx.fillStyle = Colors.text;
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText(row.label, x + 45, rowY + 22);

    ctx.textAlign = "left";
    ctx.fillStyle = Colors.muted;
    ctx.font = "16px Arial";
    ctx.fillText(fitText(ctx, row.value, width - 110), x + 86, rowY + 22);
  });
}

function drawList(
  ctx: CanvasRenderingContext2D,
  list: ListPanel,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  fillRoundRect(ctx, x, y, width, height, 16, Colors.panel);
  strokeRoundRect(ctx, x, y, width, height, 16, Colors.border);

  ctx.textAlign = "left";
  ctx.fillStyle = Colors.text;
  ctx.font = "bold 20px Arial";
  ctx.fillText(fitText(ctx, list.title, width - 70), x + 18, y + 31);

  if (list.icon) {
    ctx.textAlign = "right";
    ctx.fillStyle = Colors.muted;
    ctx.font = "21px Arial";
    ctx.fillText(list.icon, x + width - 18, y + 32);
    ctx.textAlign = "left";
  }

  const rowHeight = 38;
  const gap = 8;
  list.items.slice(0, 4).forEach((item, index) => {
    const rowY = y + 46 + index * (rowHeight + gap);
    fillRoundRect(ctx, x + 14, rowY, width - 28, rowHeight, 8, Colors.row);
    ctx.fillStyle = Colors.muted;
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(item.icon ?? "•", x + 26, rowY + 25);
    ctx.fillStyle = Colors.text;
    ctx.font = "bold 16px Arial";
    ctx.fillText(fitText(ctx, item.label, width - 210), x + 52, rowY + 25);
    ctx.textAlign = "right";
    ctx.fillStyle = Colors.muted;
    ctx.font = "16px Arial";
    ctx.fillText(fitText(ctx, item.value, 130), x + width - 24, rowY + 25);
    ctx.textAlign = "left";
  });
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartPanel,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  fillRoundRect(ctx, x, y, width, height, 16, Colors.panel);
  strokeRoundRect(ctx, x, y, width, height, 16, Colors.border);

  ctx.textAlign = "left";
  ctx.fillStyle = Colors.text;
  ctx.font = "bold 20px Arial";
  ctx.fillText(chart.title, x + 18, y + 31);

  let legendX = x + width - 18;
  for (const series of [...chart.series].reverse()) {
    ctx.textAlign = "right";
    ctx.fillStyle = Colors.muted;
    ctx.font = "15px Arial";
    ctx.fillText(series.label, legendX, y + 32);
    const textWidth = ctx.measureText(series.label).width;
    ctx.fillStyle = series.color;
    ctx.beginPath();
    ctx.arc(legendX - textWidth - 12, y + 26, 6, 0, Math.PI * 2);
    ctx.fill();
    legendX -= textWidth + 38;
  }

  const plotX = x + 22;
  const plotY = y + 54;
  const plotWidth = width - 44;
  const plotHeight = height - 88;
  const values = chart.series.flatMap((series) => series.values);
  const maxValue = Math.max(1, ...values);
  const stackedTotal = chart.stacked
    ? Math.max(
        1,
        ...Array.from(
          { length: Math.max(...chart.series.map((s) => s.values.length), 0) },
          (_, index) =>
            chart.series.reduce(
              (sum, series) => sum + (series.values[index] ?? 0),
              0,
            ),
        ),
      )
    : maxValue;
  const topValue = chart.stacked ? stackedTotal : maxValue;

  ctx.strokeStyle = Colors.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gridY = plotY + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plotX, gridY);
    ctx.lineTo(plotX + plotWidth, gridY);
    ctx.stroke();
  }

  const pointX = (seriesLength: number, index: number): number =>
    plotX + (seriesLength <= 1 ? 0 : (plotWidth * index) / (seriesLength - 1));
  const pointY = (value: number): number =>
    plotY + plotHeight - (Math.max(0, value) / topValue) * plotHeight;

  if (chart.stacked) {
    const length = Math.max(...chart.series.map((s) => s.values.length), 0);
    const cumulative = new Array<number>(length).fill(0);
    for (const series of chart.series) {
      const next = cumulative.map(
        (value, index) => value + (series.values[index] ?? 0),
      );
      ctx.beginPath();
      for (let index = 0; index < length; index++) {
        const px = pointX(length, index);
        const py = pointY(next[index] ?? 0);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      for (let index = length - 1; index >= 0; index--) {
        ctx.lineTo(pointX(length, index), pointY(cumulative[index] ?? 0));
      }
      ctx.closePath();
      ctx.fillStyle = `${series.color}66`;
      ctx.fill();
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let index = 0; index < length; index++) {
        cumulative[index] = next[index] ?? 0;
      }
    }
  } else {
    for (const series of chart.series) {
      if (series.values.length === 0) continue;
      ctx.beginPath();
      series.values.forEach((value, index) => {
        const px = pointX(series.values.length, index);
        const py = pointY(value);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      if (chart.series.length === 1) {
        ctx.lineTo(plotX + plotWidth, plotY + plotHeight);
        ctx.lineTo(plotX, plotY + plotHeight);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(
          0,
          plotY,
          0,
          plotY + plotHeight,
        );
        gradient.addColorStop(0, `${series.color}55`);
        gradient.addColorStop(1, `${series.color}00`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = Colors.dim;
  ctx.font = "12px Arial";
  const labelCount = Math.min(7, chart.labels.length);
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round(
      (i * Math.max(0, chart.labels.length - 1)) / Math.max(1, labelCount - 1),
    );
    const label = chart.labels[index] ?? "";
    const px =
      plotX +
      (chart.labels.length <= 1
        ? 0
        : (plotWidth * index) / (chart.labels.length - 1));
    ctx.textAlign =
      i === 0 ? "left" : i === labelCount - 1 ? "right" : "center";
    ctx.fillText(label, px, plotY + plotHeight + 22);
  }
}

export async function generateStatsCard(
  payload: StatsCardPayload,
): Promise<Buffer> {
  const canvas = createCanvas(StatsCardWidth, StatsCardHeight);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);
  const icon = await loadIcon(payload.iconUrl);
  drawHeader(ctx, payload, icon);

  const boxTop = 148;
  const boxHeight = 232;
  const gap = 16;
  const available = StatsCardWidth - 72;
  const boxWidth =
    (available - gap * (payload.boxes.length - 1)) / payload.boxes.length;
  payload.boxes.slice(0, 4).forEach((box, index) => {
    drawBox(
      ctx,
      box,
      36 + index * (boxWidth + gap),
      boxTop,
      boxWidth,
      boxHeight,
    );
  });

  const chartView = payload.view === "chart";
  const lists = payload.lists.slice(0, 2);
  if (!chartView && lists.length > 0) {
    const listTop = 398;
    const listHeight = 192;
    const listGap = 16;
    const listWidth =
      lists.length === 1
        ? StatsCardWidth - 72
        : (StatsCardWidth - 72 - listGap) / 2;
    lists.forEach((list, index) => {
      drawList(
        ctx,
        list,
        36 + index * (listWidth + listGap),
        listTop,
        listWidth,
        listHeight,
      );
    });
  }

  if (payload.chart) {
    const chartTop = chartView ? 398 : lists.length > 0 ? 608 : 398;
    const chartHeight = chartView ? 424 : lists.length > 0 ? 222 : 424;
    drawChart(
      ctx,
      payload.chart,
      36,
      chartTop,
      StatsCardWidth - 72,
      chartHeight,
    );
  }

  ctx.fillStyle = Colors.muted;
  ctx.font = "15px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    payload.footer ??
      `Server Lookback: Last ${payload.lookback} · Timezone: UTC`,
    36,
    StatsCardHeight - 24,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = Colors.cyan;
  ctx.font = "bold 15px Arial";
  ctx.fillText("LUMI", StatsCardWidth - 36, StatsCardHeight - 24);
  ctx.fillStyle = Colors.muted;
  ctx.font = "15px Arial";
  const lumiWidth = ctx.measureText("LUMI").width;
  ctx.fillText(
    "Powered by ",
    StatsCardWidth - 36 - lumiWidth - 6,
    StatsCardHeight - 24,
  );

  return canvas.toBuffer("image/png");
}

export const ChartColors = {
  message: Colors.green,
  voice: Colors.pink,
  online: Colors.green,
  idle: Colors.yellow,
  dnd: Colors.red,
  offline: Colors.dim,
  accent: Colors.blue,
  cyan: Colors.cyan,
  violet: Colors.violet,
} as const;
