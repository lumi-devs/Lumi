// Module-local Redis key builders. Entry sets are ephemeral/high-churn (one
// SADD per click), so they live in Redis rather than guildKV - the giveaway's
// durable metadata (prize, schedule, winners) is what goes to guildKV instead.
export const GiveawayKeys = {
  entries: (guildId: string, giveawayId: string) => `lumi:addon:giveaway:${guildId}:${giveawayId}:entries`,
};
