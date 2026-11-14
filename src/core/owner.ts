export function ownerIds(): string[] {
  return (process.env.OWNER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isBotOwner(userId: string): boolean {
  return ownerIds().includes(userId);
}
