import type { Client } from "discord.js";

export type PermitKind = "CUSTOM";
export type Polarity = "Grant" | "Deny";
export type PermitTargetType = "USER" | "ROLE" | "CHANNEL";

export interface Permit {
  readonly id: number;
  readonly guildId: string;
  readonly name: string;
  readonly number: number;
  readonly nodes: readonly string[];
  readonly polarity: Polarity;
  readonly position: number;
  readonly builtin: boolean;
  readonly expiresAt: Date | null;
  readonly schedule: unknown;
  readonly timezone: string | null;
  readonly conditions: unknown;
  readonly whitelistScopes: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PermitAssignment {
  readonly id: number;
  readonly permitId: number;
  readonly guildId: string;
  readonly targetType: PermitTargetType;
  readonly targetId: string;
  readonly grantedAt: Date;
  readonly grantedBy: string;
  readonly expiresAt: Date | null;
}

export interface PermitWithAssignments extends Permit {
  readonly assignments: PermitAssignment[];
}

export interface PermitConditions {
  readonly channelIds?: readonly string[];
  readonly roleIds?: readonly string[];
  readonly notRoleIds?: readonly string[];
  readonly timeWindow?: {
    readonly start: string;
    readonly end: string;
    readonly days?: readonly number[];
  };
  readonly timezone?: string;
}

export interface EvaluatePermitOptions {
  readonly guildId: string;
  readonly userId: string;
  readonly roleIds?: readonly string[];
  readonly channelId?: string;
  readonly guildOwnerId?: string | null;
  readonly permitNode: string;
  readonly at?: Date;
  readonly managerBypass?: boolean;
}

export interface PermitChainTarget {
  readonly targetType: PermitTargetType;
  readonly targetId: string;
}

export interface PermitChainResult {
  readonly tiers: readonly {
    readonly custom: {
      readonly grant: readonly string[];
      readonly deny: readonly string[];
      readonly scopes?: readonly string[];
      readonly denyScopes?: readonly string[];
    };
  }[];
  readonly isQuarantined: boolean;
}

export interface PermitChainStore {
  getPermitChain(
    guildId: string,
    userId: string,
    chain: readonly PermitChainTarget[],
  ): Promise<PermitChainResult>;
}

export interface PermitContainer {
  readonly db: { readonly permits: PermitChainStore };
  readonly client?: Client;
}

export interface PermitTierExplanation {
  readonly tier: string;
  readonly verdict: "allow" | "deny" | "pass";
  readonly detail?: string;
}

export interface EvaluatedPermit {
  readonly rows: readonly PermitTierExplanation[];
  readonly allowed: boolean;
}
