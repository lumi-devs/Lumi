import type {
  PanicState,
  Prisma,
  VerificationPanel,
} from "../../generated/client/index.js";
import { Repository, type RepositoryDeps } from "./base.ts";

export interface SavePanicStateInput {
  guildId: string;
  actorId: string;
  invitesPaused: boolean;
  lockedChannels: Record<string, boolean | null>;
}

export class SecurityRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  /**
   * Panic state drives irreversible channel edits and must not be served from
   * a lagging replica. The same applies to the verification panel because a
   * click can arrive immediately after the panel is posted.
   */
  public getPanicState(guildId: string): Promise<PanicState | null> {
    return this.prisma.panicState.findUnique({ where: { guildId } });
  }

  public async savePanicState(input: SavePanicStateInput): Promise<PanicState> {
    await this.prisma.guild.upsert({
      where: { id: input.guildId },
      create: { id: input.guildId },
      update: {},
    });

    return this.prisma.panicState.upsert({
      where: { guildId: input.guildId },
      create: {
        guildId: input.guildId,
        actorId: input.actorId,
        invitesPaused: input.invitesPaused,
        lockedChannels: input.lockedChannels as Prisma.InputJsonValue,
      },
      update: {
        actorId: input.actorId,
        invitesPaused: input.invitesPaused,
        lockedChannels: input.lockedChannels as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });
  }

  public async clearPanicState(guildId: string): Promise<void> {
    await this.prisma.panicState.deleteMany({ where: { guildId } });
  }

  public getVerificationPanel(guildId: string): Promise<VerificationPanel | null> {
    return this.prisma.verificationPanel.findUnique({ where: { guildId } });
  }

  public async saveVerificationPanel(input: {
    guildId: string;
    channelId: string;
    messageId: string;
  }): Promise<VerificationPanel> {
    await this.prisma.guild.upsert({
      where: { id: input.guildId },
      create: { id: input.guildId },
      update: {},
    });

    return this.prisma.verificationPanel.upsert({
      where: { guildId: input.guildId },
      create: input,
      update: { channelId: input.channelId, messageId: input.messageId },
    });
  }
}
