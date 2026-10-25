import { ModulePanel } from "./apps/bot/src/admin/src/panel/ModulePanel.js";
import { HubPanel } from "./apps/bot/src/admin/src/panel/HubPanel.js";

const modules = [
  ["afk", "AFK", "🛌", "Away status"],
  ["economy", "Economy", "🪙", "Currency"],
  ["leveling", "Leveling", "📈", "XP"],
  ["logging", "Logging", "📝", "Logs"],
  ["mod", "Moderation", "🛡️", "Mod tools"],
  ["tempvc", "Temporary Voice", "🔊", "Voice"],
  ["utility", "Utility", "🧰", "Utilities"],
].map(([name, displayName, emoji, description]) => ({ name, displayName, emoji, description, version: "2" }));

const guild = { id: "1", name: "Test", memberCount: 3, iconURL: () => null };
const client = { user: { username: "Lumi" }, guilds: { cache: new Map([["1", guild]]) }, ws: { ping: 42, shards: new Map([[0, { ping: 42 }]]) }, uptime: 1000 };
const interaction: any = {
  guildId: "1", guild, client, user: { id: "u" },
  member: { permissions: { has: () => true } },
  isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false,
  reply: async () => undefined, update: async () => undefined, editReply: async () => undefined,
  message: { interactionMetadata: { user: { id: "u" } }, interaction: { user: { id: "u" } } },
};
const services: any = {
  client, redis: {}, prisma: {},
  moduleLoader: { listGlobal: () => modules, isEnabled: () => true },
  moduleManager: { list: async () => modules.map((m) => ({ ...m, enabled: true })), getConfig: async () => ({}), enable: async () => undefined, disable: async () => undefined, reload: async () => undefined },
  config: { get: async () => undefined }, permits: { listPermits: async () => [] },
};

const collect = (node: any, ids: string[]) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.custom_id === "string") ids.push(node.custom_id);
  if (typeof node.customId === "string") ids.push(node.customId);
  for (const value of Object.values(node)) collect(value, ids);
};

const inspect = (label: string, card: any) => {
  const ids: string[] = [];
  collect(card, ids);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  console.log(label, "flags", card.flags, "ids", ids.length, "dupes", [...new Set(dupes)]);
};

const panel = new ModulePanel({ moduleManager: services.moduleManager, guildId: "1", interaction });
inspect("module-list", await (panel as any).listCard(0));
inspect("module-detail", await (panel as any).detailCard("mod", 0));
for (const view of ["home", "modules", "settings", "permits"] as const) {
  inspect(`hub-${view}`, await HubPanel.render(view, interaction, services));
}
process.exit(0);
