export function calculateLevel(xp: number): number {
  // Quadratic curve: level = floor(sqrt(xp / 100))
  return Math.floor(Math.sqrt(xp / 100));
}

export function xpForLevel(level: number): number {
  return level * level * 100;
}

export function xpToNextLevel(currentXp: number): number {
  const currentLevel = calculateLevel(currentXp);
  return xpForLevel(currentLevel + 1) - currentXp;
}

export function getXpMultiplier(member: any, config: any): number {
  let multiplier = 1;
  for (const mr of config.multiplierRoles ?? []) {
    if (member.roles?.cache?.has?.(mr.roleId)) {
      multiplier = Math.max(multiplier, mr.multiplier);
    }
  }
  return multiplier;
}

export function getRoleRewards(config: any): Array<{ level: number; roleId: string; removePrevious: boolean }> {
  return config.roleRewards ?? [];
}

export function checkRoleRewards(services: any, guildId: string, userId: string, newLevel: number, config: any): void {
  const rewards = getRoleRewards(config);
  for (const reward of rewards) {
    if (newLevel >= reward.level) {
      try {
        const guild = services.client.guilds.cache.get(guildId);
        if (guild) {
          const member = guild.members.cache.get(userId);
          if (member) {
            if (reward.removePrevious) {
              for (const r of config.roleRewards ?? []) {
                if (r.level < reward.level && member.roles.cache.has(r.roleId)) {
                  member.roles.remove(r.roleId).catch(() => {});
                }
              }
            }
            member.roles.add(reward.roleId).catch(() => {});
          }
        }
      } catch (e) {
        console.error(`Failed to assign level role ${reward.roleId}:`, e);
      }
    }
  }
}

export function getXpGain(config: any, type: "message" | "voice"): number {
  if (type === "message") return config.xpPerMessage ?? 15;
  return config.xpPerMinuteVc ?? 10;
}

export function isIgnoredChannel(config: any, channelId: string): boolean {
  return config.ignoredChannels?.includes(channelId) ?? false;
}

export function isIgnoredRole(config: any, member: any): boolean {
  return config.ignoredRoles?.some((id: string) => member.roles?.cache?.has?.(id)) ?? false;
}

export function isOnCooldown(user: any, config: any): boolean {
  if (!user.lastXpAt) return false;
  const now = Date.now();
  const lastXp = new Date(user.lastXpAt).getTime();
  return now - lastXp < (config.cooldownSeconds ?? 60) * 1000;
}