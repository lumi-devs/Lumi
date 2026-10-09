export interface IReactionRoleRegistry {
  isPending(key: string): boolean;
  setPending(key: string): void;
  clearPending(key: string): void;
}
