export interface ScopedDataAccessor {
  get<T>(key: string, defaultValue?: T): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface ScopedDataStore {
  guild(guildId: string): ScopedDataAccessor;
  user(userId: string): ScopedDataAccessor;
  member(guildId: string, userId: string): ScopedDataAccessor;
  global(): ScopedDataAccessor;
}

export interface UnderlyingDataHelper {
  get<T>(
    guildId: string,
    moduleName: string,
    targetId: string,
    key: string,
  ): Promise<T | null>;
  set<T>(
    guildId: string,
    moduleName: string,
    targetId: string,
    key: string,
    value: T,
    options?: { ttlMs?: number },
  ): Promise<void>;
  delete(
    guildId: string,
    moduleName: string,
    targetId: string,
    key: string,
  ): Promise<number | boolean>;
}

export function createScopedDataStore(
  helper: UnderlyingDataHelper,
  moduleName: string,
): ScopedDataStore {
  const accessor = (guildId: string, targetId: string): ScopedDataAccessor => ({
    async get<T>(key: string, defaultValue?: T): Promise<T | null> {
      const val = await helper.get<T>(guildId, moduleName, targetId, key);
      return val ?? (defaultValue !== undefined ? defaultValue : null);
    },
    async set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void> {
      await helper.set(guildId, moduleName, targetId, key, value, options);
    },
    async delete(key: string): Promise<boolean> {
      const res = await helper.delete(guildId, moduleName, targetId, key);
      return typeof res === "number" ? res > 0 : Boolean(res);
    },
  });

  return {
    guild: (guildId: string) => accessor(guildId, "guild"),
    user: (userId: string) => accessor("global", userId),
    member: (guildId: string, userId: string) => accessor(guildId, userId),
    global: () => accessor("global", "global"),
  };
}
