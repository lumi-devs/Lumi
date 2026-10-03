export interface IStickyIndex {
  get(channelId: string): Promise<string | null>;
  set(channelId: string, messageId: string): Promise<void>;
  delete(channelId: string): Promise<void>;
}
