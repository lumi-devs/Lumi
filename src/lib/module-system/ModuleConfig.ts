import type { Container } from "#src/lib/Services.js";
import { configLock } from "#src/lib/prisma/GuildTransaction.js";
import type { ScopedConfigScope } from "#src/lib/prisma/repositories/ConfigRepository.js";

export type { ScopedConfigScope };

export type ConfigScope =
  | { kind: "global" }
  | { kind: "channel"; id: string }
  | { kind: "role"; id: string }
  | { kind: "user"; id: string }
  | { kind: "member"; id: string }
  | { kind: "custom"; group: string; id: string };

export interface ScopedConfig<D extends Record<string, unknown>> {
  get<K extends Extract<keyof D, string>>(key: K): Promise<D[K]>;
  set<K extends Extract<keyof D, string>>(key: K, value: D[K]): Promise<void>;
  getAll(): Promise<D>;
  clear<K extends Extract<keyof D, string>>(key: K): Promise<void>;
  getPath<K extends Extract<keyof D, string>>(key: K, path: string[]): Promise<unknown>;
  setPath<K extends Extract<keyof D, string>>(
    key: K,
    path: string[],
    value: unknown,
  ): Promise<void>;
  mutate<K extends Extract<keyof D, string>>(
    key: K,
    fn: (current: D[K]) => D[K] | Promise<D[K]>,
  ): Promise<D[K]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withPathValue(current: unknown, path: string[], value: unknown): unknown {
  const [head, ...tail] = path;
  if (head === undefined) return value;
  if (Array.isArray(current)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0) return current;
    const next = [...current];
    next[index] = withPathValue(next[index], tail, value);
    return next;
  }
  const next: Record<string, unknown> = isRecord(current) ? { ...current } : {};
  next[head] = withPathValue(next[head], tail, value);
  return next;
}

function scopeParts(scope: ConfigScope): {
  kind: ScopedConfigScope;
  scopeId: string;
} {
  switch (scope.kind) {
    case "global":
      return { kind: "global", scopeId: "" };
    case "channel":
    case "role":
    case "user":
    case "member":
      return { kind: scope.kind, scopeId: scope.id };
    case "custom":
      return { kind: "custom", scopeId: `${scope.group}:${scope.id}` };
  }
}

export interface ModuleConfig<D extends Record<string, unknown>> {
  forGuild(services: Container, guildId: string): ScopedConfig<D>;
  forGlobal(services: Container): ScopedConfig<D>;
  forScope(
    services: Container,
    guildId: string,
    scope: ConfigScope,
  ): ScopedConfig<D>;
}

export function defineModuleConfig<D extends Record<string, unknown>>(
  moduleName: string,
  defaults: D,
): ModuleConfig<D> {
  const scoped = (
    services: Container,
    guildId: string,
    kind: ScopedConfigScope,
    scopeId: string,
  ): ScopedConfig<D> => {
    const api: ScopedConfig<D> = {
      async get<K extends Extract<keyof D, string>>(key: K): Promise<D[K]> {
        const stored: unknown = await services.db.config.getScopedConfig(
          guildId,
          moduleName,
          kind,
          scopeId,
          key,
        );
        if (stored === null || stored === undefined) return defaults[key];
        return stored as D[K];
      },
      async set<K extends Extract<keyof D, string>>(key: K, value: D[K]): Promise<void> {
        await services.db.config.setScopedConfig(
          guildId,
          moduleName,
          kind,
          scopeId,
          key,
          value as never,
        );
      },
      async getAll(): Promise<D> {
        const stored = await services.db.config.getAllScopedConfig(
          guildId,
          moduleName,
          kind,
          scopeId,
        );
        return { ...defaults, ...stored };
      },
      async clear<K extends Extract<keyof D, string>>(key: K): Promise<void> {
        await services.db.config.deleteScopedConfigKey(
          guildId,
          moduleName,
          kind,
          scopeId,
          key,
        );
      },
      async getPath<K extends Extract<keyof D, string>>(
        key: K,
        path: string[],
      ): Promise<unknown> {
        let current: unknown = await api.get(key);
        for (const segment of path) {
          if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index) || index < 0) return undefined;
            current = current[index];
          } else if (isRecord(current)) {
            current = current[segment];
          } else {
            return undefined;
          }
        }
        return current;
      },
      async setPath<K extends Extract<keyof D, string>>(
        key: K,
        path: string[],
        value: unknown,
      ): Promise<void> {
        if (path.length === 0) {
          await api.set(key, value as D[K]);
          return;
        }
        await api.mutate(key, (current) => withPathValue(current, path, value) as D[K]);
      },
      async mutate<K extends Extract<keyof D, string>>(
        key: K,
        fn: (current: D[K]) => D[K] | Promise<D[K]>,
      ): Promise<D[K]> {
        const release = await configLock(guildId);
        try {
          const next = await fn(structuredClone(await api.get(key)));
          await api.set(key, next);
          return next;
        } finally {
          release();
        }
      },
    };
    return api;
  };

  return {
    forGuild(services: Container, guildId: string): ScopedConfig<D> {
      return scoped(services, guildId, "global", "");
    },
    forGlobal(services: Container): ScopedConfig<D> {
      return scoped(services, "", "global", "");
    },
    forScope(
      services: Container,
      guildId: string,
      scope: ConfigScope,
    ): ScopedConfig<D> {
      const parts = scopeParts(scope);
      return scoped(services, guildId, parts.kind, parts.scopeId);
    },
  };
}
