export interface GuildAccess {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}
