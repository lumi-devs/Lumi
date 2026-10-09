import type { FeatureFlag } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { ValkeyKeys, ValkeyTTL } from "#lib/valkey/client.js";

export interface SetFeatureFlagInput {
  key: string;
  description?: string | null;
  enabled: boolean;
  rolloutPercent: number;
  updatedBy: string;
}

export interface SetFeatureFlagOverrideInput {
  flagKey: string;
  guildId: string;
  enabled: boolean;
}

export interface FeatureFlagOverrideEntry {
  id: number;
  flagKey: string;
  guildId: string;
  enabled: boolean;
  createdAt: Date;
}

/** Just enough of a flag to evaluate it - cached separately from the full row so evaluation never pays for `description`. */
export interface FeatureFlagEvalShape {
  enabled: boolean;
  rolloutPercent: number;
}

/**
 * Global feature flags (`FeatureFlag`) with optional per-guild overrides
 * (`FeatureFlagOverride`). `#lib/feature-flags/index.ts` is the evaluation
 * entry point; this repository only owns the rows and their cache.
 */
export class FeatureFlagRepository extends Repository {
  public listFlags(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  }

  public async setFlag(input: SetFeatureFlagInput): Promise<FeatureFlag> {
    const { key, description, enabled, rolloutPercent, updatedBy } = input;
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      create: {
        key,
        description: description ?? null,
        enabled,
        rolloutPercent,
        updatedBy,
      },
      update: {
        ...(description !== undefined && { description }),
        enabled,
        rolloutPercent,
        updatedBy,
      },
    });
    await this.invalidate(ValkeyKeys.featureFlagEval(key));
    return flag;
  }

  /** Cached `{ enabled, rolloutPercent }` projection - the only shape `isFlagEnabled` needs. */
  public getFlagForEvaluation(key: string): Promise<FeatureFlagEvalShape | null> {
    return this.getOrSet(
      ValkeyKeys.featureFlagEval(key),
      ValkeyTTL.featureFlagEval,
      async () => {
        const flag = await this.prisma.featureFlag.findUnique({
          where: { key },
          select: { enabled: true, rolloutPercent: true },
        });
        return flag ?? null;
      },
    );
  }

  public listOverrides(flagKey: string): Promise<FeatureFlagOverrideEntry[]> {
    return this.prisma.featureFlagOverride.findMany({
      where: { flagKey },
      orderBy: { guildId: "asc" },
    });
  }

  public async setOverride(
    input: SetFeatureFlagOverrideInput,
  ): Promise<FeatureFlagOverrideEntry> {
    const { flagKey, guildId, enabled } = input;
    const override = await this.prisma.featureFlagOverride.upsert({
      where: { uq_feature_flag_override: { flagKey, guildId } },
      create: { flagKey, guildId, enabled },
      update: { enabled },
    });
    await this.invalidate(ValkeyKeys.featureFlagOverride(flagKey, guildId));
    return override;
  }

  public async deleteOverride(flagKey: string, guildId: string): Promise<boolean> {
    const { count } = await this.prisma.featureFlagOverride.deleteMany({
      where: { flagKey, guildId },
    });
    if (count > 0) {
      await this.invalidate(ValkeyKeys.featureFlagOverride(flagKey, guildId));
    }
    return count > 0;
  }

  public getOverride(
    flagKey: string,
    guildId: string,
  ): Promise<{ enabled: boolean } | null> {
    return this.getOrSet(
      ValkeyKeys.featureFlagOverride(flagKey, guildId),
      ValkeyTTL.featureFlagOverride,
      async () => {
        const override = await this.prisma.featureFlagOverride.findUnique({
          where: { uq_feature_flag_override: { flagKey, guildId } },
          select: { enabled: true },
        });
        return override ?? null;
      },
    );
  }
}
