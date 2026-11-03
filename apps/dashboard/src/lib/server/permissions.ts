export function parseOwnerIds(value: string | null | undefined): string[] {
  const ids = (value ?? "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d{16,22}$/.test(id));
  return Array.from(new Set(ids));
}

export function isBotOwner(
  userId: string | null | undefined,
  ownerIds: readonly string[],
): boolean {
  return (
    typeof userId === "string" && userId.length > 0 && ownerIds.includes(userId)
  );
}

export function isOwnerOnlyPermitNodes(nodes: readonly string[]): boolean {
  return nodes.includes("*");
}

export function canManageOwnerOnlyPermit(
  userId: string | null | undefined,
  nodes: readonly string[],
  ownerIds: readonly string[],
): boolean {
  return !isOwnerOnlyPermitNodes(nodes) || isBotOwner(userId, ownerIds);
}
