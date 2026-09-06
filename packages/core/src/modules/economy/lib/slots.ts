export type SlotReel =
  | "cherries"
  | "cookie"
  | "two"
  | "clover"
  | "cyclone"
  | "sunflower"
  | "six"
  | "mushroom"
  | "heart"
  | "snowflake";

export const SlotDeck: readonly SlotReel[] = [
  "cherries",
  "cookie",
  "two",
  "clover",
  "cyclone",
  "sunflower",
  "six",
  "mushroom",
  "heart",
  "snowflake",
];

export const SlotEmoji: Record<SlotReel, string> = {
  cherries: "🍒",
  cookie: "🍪",
  two: "2️⃣",
  clover: "🍀",
  cyclone: "🌀",
  sunflower: "🌻",
  six: "6️⃣",
  mushroom: "🍄",
  heart: "❤️",
  snowflake: "❄️",
};

export type SlotPayoutKey =
  | "jackpot"
  | "cloverThree"
  | "cherriesThree"
  | "twoSix"
  | "cherriesTwo"
  | "threeKind"
  | "twoKind";

export const DefaultSlotPayouts: Record<SlotPayoutKey, number> = {
  jackpot: 50,
  cloverThree: 25,
  cherriesThree: 20,
  twoSix: 4,
  cherriesTwo: 3,
  threeKind: 10,
  twoKind: 2,
};

export const SlotPayoutLabels: Record<SlotPayoutKey, string> = {
  jackpot: "JACKPOT! 2-2-6",
  cloverThree: "Triple clover",
  cherriesThree: "Triple cherries",
  twoSix: "2 followed by 6",
  cherriesTwo: "Double cherries",
  threeKind: "Three of a kind",
  twoKind: "Two in a row",
};

export function defaultSlotPayoutEntries(): string[] {
  return (Object.keys(DefaultSlotPayouts) as SlotPayoutKey[]).map(
    (key) => `${key}:${DefaultSlotPayouts[key]}`,
  );
}

export function parseSlotPayouts(
  entries: unknown,
): Record<SlotPayoutKey, number> {
  const parsed = { ...DefaultSlotPayouts };
  if (!Array.isArray(entries)) return parsed;
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const [rawKey, rawValue] = entry.split(":");
    const key = rawKey?.trim() as SlotPayoutKey | undefined;
    const value = Number(rawValue);
    if (
      key &&
      key in DefaultSlotPayouts &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 1000
    ) {
      parsed[key] = value;
    }
  }
  return parsed;
}

export type SlotRow = [SlotReel, SlotReel, SlotReel];

export interface SlotSpin {
  rows: [SlotRow, SlotRow, SlotRow];
  middle: SlotRow;
}

export function spinSlots(random: () => number = Math.random): SlotSpin {
  const size = SlotDeck.length;
  const reels: SlotReel[][] = [];
  for (let i = 0; i < 3; i++) {
    const offset = Math.floor(random() * size) % size;
    reels.push([
      SlotDeck[offset]!,
      SlotDeck[(offset + 1) % size]!,
      SlotDeck[(offset + 2) % size]!,
    ]);
  }
  const rows: [SlotRow, SlotRow, SlotRow] = [
    [reels[0]![0]!, reels[1]![0]!, reels[2]![0]!],
    [reels[0]![1]!, reels[1]![1]!, reels[2]![1]!],
    [reels[0]![2]!, reels[1]![2]!, reels[2]![2]!],
  ];
  return { rows, middle: rows[1] };
}

export interface SlotOutcome {
  key: SlotPayoutKey | null;
  multiplier: number;
  pay: number;
}

export function resolveSlotPayout(
  middle: SlotRow,
  bid: number,
  payouts: Record<SlotPayoutKey, number>,
): SlotOutcome {
  const [a, b, c] = middle;
  const none: SlotOutcome = { key: null, multiplier: 0, pay: 0 };
  if (a === "two" && b === "two" && c === "six") {
    return { key: "jackpot", multiplier: payouts.jackpot, pay: bid * payouts.jackpot };
  }
  if (a === "clover" && b === "clover" && c === "clover") {
    return { key: "cloverThree", multiplier: payouts.cloverThree, pay: bid * payouts.cloverThree };
  }
  if (a === "cherries" && b === "cherries" && c === "cherries") {
    return { key: "cherriesThree", multiplier: payouts.cherriesThree, pay: bid * payouts.cherriesThree };
  }
  if ((a === "two" && b === "six") || (b === "two" && c === "six")) {
    return { key: "twoSix", multiplier: payouts.twoSix, pay: bid * payouts.twoSix };
  }
  if ((a === "cherries" && b === "cherries") || (b === "cherries" && c === "cherries")) {
    return { key: "cherriesTwo", multiplier: payouts.cherriesTwo, pay: bid * payouts.cherriesTwo };
  }
  if (a === b && b === c) {
    return { key: "threeKind", multiplier: payouts.threeKind, pay: bid * payouts.threeKind };
  }
  if (a === b || b === c) {
    return { key: "twoKind", multiplier: payouts.twoKind, pay: bid * payouts.twoKind };
  }
  return none;
}

export function renderSlotGrid(spin: SlotSpin): string {
  return spin.rows
    .map((row, i) => {
      const sign = i === 1 ? ">" : " ";
      return `${sign} ${row.map((reel) => SlotEmoji[reel]).join(" ")}`;
    })
    .join("\n");
}
