import {
  Events,
  type Client,
  type GuildMember,
  type Message,
  type PartialUser,
  type Presence,
  type ThreadChannel,
  type User,
  type VoiceState,
} from "discord.js";
import type { AddonEventName } from "@lumi/contracts";
import type { Container } from "#lib/services.js";

function rolesOf(member: GuildMember | null): string[] {
  if (!member) return [];
  try {
    return [...member.roles.cache.keys()];
  } catch {
    return [];
  }
}

function emit(
  services: Container,
  event: AddonEventName,
  guildId: string | null,
  data: Record<string, unknown>,
): void {
  try {
    services.moduleStore.emitAddonEvent(event, guildId, data);
  } catch (err: unknown) {
    services.logger.warn(`[AddonEvents] relay of "${event}" failed:`, err);
  }
}

export function attachAddonEventRelay(client: Client, services: Container): void {
  client.on(Events.PresenceUpdate, (oldPresence, newPresence: Presence) => {
    void (async () => {
      const presence = newPresence ?? oldPresence;
      const guild = presence?.guild;
      const member = presence?.member ?? null;
      if (!guild || !presence) return;
      emit(services, "presenceUpdate", guild.id, {
        userId: presence.userId,
        guildId: guild.id,
        status: presence.status,
        activities: presence.activities.map((a) => ({
          name: a.name,
          type: a.type,
          state: a.state ?? null,
        })),
        roles: rolesOf(member),
      });
    })();
  });

  client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
    void (async () => {
      const state = newState ?? oldState;
      const guild = state?.guild;
      if (!guild) return;
      emit(services, "voiceStateUpdate", guild.id, {
        guildId: guild.id,
        userId: state.member?.id ?? state.id,
        oldChannelId: oldState?.channelId ?? null,
        newChannelId: newState?.channelId ?? null,
        roles: rolesOf((state.member ?? oldState?.member) as GuildMember | null),
      });
    })();
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember: GuildMember) => {
    void (async () => {
      const member = newMember ?? oldMember;
      if (!member) return;
      emit(services, "guildMemberUpdate", member.guild.id, {
        guildId: member.guild.id,
        userId: member.id,
        oldRoles: rolesOf(oldMember as GuildMember | null),
        newRoles: rolesOf(newMember as GuildMember | null),
        nickname: member.nickname ?? null,
        pending: member.pending,
      });
    })();
  });

  client.on(Events.MessageCreate, (message: Message) => {
    void (async () => {
      if (!message.guildId) return;
      emit(services, "messageCreate", message.guildId, {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author.id,
        authorBot: message.author.bot,
        content: message.content ?? "",
      });
    })();
  });

  client.on(Events.ThreadCreate, (thread: ThreadChannel) => {
    void (async () => {
      if (!thread.guildId) return;
      emit(services, "threadCreate", thread.guildId, {
        guildId: thread.guildId,
        parentId: thread.parentId ?? "",
        threadId: thread.id,
        name: thread.name,
      });
    })();
  });

  client.on(Events.UserUpdate, (oldUser: User | PartialUser, newUser: User) => {
    void (async () => {
      const user = newUser ?? oldUser;
      if (!user || !("username" in user) || user.username == null) return;
      emit(services, "userUpdate", null, {
        userId: user.id,
        username: user.username,
        globalName: (user as User).globalName ?? null,
        avatar: (user as User).avatar ?? null,
      });
    })();
  });
}
