export interface NickHierarchyInput {
  actorTopRolePosition: number;
  targetTopRolePosition: number;
  actorIsGuildOwner?: boolean;
  targetIsGuildOwner?: boolean;
}

export type NickHierarchyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function canChangeNickname(
  input: NickHierarchyInput,
): NickHierarchyDecision {
  if (input.targetIsGuildOwner) {
    return {
      allowed: false,
      reason: "The server owner's nickname cannot be changed.",
    };
  }

  if (input.actorIsGuildOwner) {
    return { allowed: true };
  }

  if (input.actorTopRolePosition > input.targetTopRolePosition) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "You need a role higher than that member's highest role.",
  };
}
