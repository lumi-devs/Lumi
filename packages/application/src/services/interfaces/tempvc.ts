export interface ITempVcRegistry {
  isRegistered(channelId: string): boolean;
  register(channelId: string, guildId: string, ownerId: string): void;
  unregister(channelId: string): void;
}
