import type { Container } from "#src/lib/Services.js";
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
  ): ScopedConfig<D> => ({
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
  });

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
