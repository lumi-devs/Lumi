/**
 * First-class Domain Events for Lumi.
 * Represents core state transitions across the platform.
 */

export interface DomainEvent<P = unknown> {
  eventId: string;
  type: string;
  version: number;
  timestamp: number;
  producer: string;
  correlationId?: string;
  causationId?: string;
  tenantId: string; // guildId or "global"
  payload: P;
}

export interface GuildCreatedPayload {
  guildId: string;
  name: string;
  ownerId: string;
}

export interface GuildDeletedPayload {
  guildId: string;
}

export interface GuildSettingsUpdatedPayload {
  guildId: string;
  moduleName: string;
  key: string;
  value: unknown;
}

export interface ModuleEnabledPayload {
  guildId: string;
  moduleName: string;
  actorId?: string;
}

export interface ModuleDisabledPayload {
  guildId: string;
  moduleName: string;
  actorId?: string;
}

export interface ModerationCaseCreatedPayload {
  guildId: string;
  caseId: number;
  targetId: string;
  moderatorId: string;
  action: string;
  reason: string;
}

export interface ModerationCaseUpdatedPayload {
  guildId: string;
  caseId: number;
  reason?: string;
}

export interface AddonInstalledPayload {
  moduleName: string;
  source: string;
  authorId?: string;
}

export interface AddonRemovedPayload {
  moduleName: string;
  authorId?: string;
}

export type LumiDomainEvent =
  | (DomainEvent<GuildCreatedPayload> & { type: "GuildCreated" })
  | (DomainEvent<GuildDeletedPayload> & { type: "GuildDeleted" })
  | (DomainEvent<GuildSettingsUpdatedPayload> & { type: "GuildSettingsUpdated" })
  | (DomainEvent<ModuleEnabledPayload> & { type: "ModuleEnabled" })
  | (DomainEvent<ModuleDisabledPayload> & { type: "ModuleDisabled" })
  | (DomainEvent<ModerationCaseCreatedPayload> & { type: "ModerationCaseCreated" })
  | (DomainEvent<ModerationCaseUpdatedPayload> & { type: "ModerationCaseUpdated" })
  | (DomainEvent<AddonInstalledPayload> & { type: "AddonInstalled" })
  | (DomainEvent<AddonRemovedPayload> & { type: "AddonRemoved" });

/** Outbox event representation stored in database or queue. */
export interface OutboxMessage<P = unknown> {
  id: string;
  eventId: string;
  eventType: string;
  tenantId: string;
  payload: P;
  published: boolean;
  createdAt: Date;
  publishedAt?: Date | null;
}
