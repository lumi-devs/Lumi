"use client";

import { useCallback, useEffect, useState } from "react";

function collapsedGroupsKey(guildId: string) {
  return `lumi:nav-collapsed-groups:${guildId}`;
}

// Per-guild persistence for which sidebar groups (Moderation, Security, …)
// are collapsed. Distinct from shadcn's `sidebar_state` cookie, which tracks
// the whole rail's icon-collapse state, not individual group open/closed.
export function useCollapsedNavGroups(guildId: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapsedGroupsKey(guildId));
      setCollapsed(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setCollapsed(new Set());
    }
  }, [guildId]);

  const toggle = useCallback(
    (title: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(title)) {
          next.delete(title);
        } else {
          next.add(title);
        }
        try {
          localStorage.setItem(collapsedGroupsKey(guildId), JSON.stringify([...next]));
        } catch {
          // localStorage may be unavailable (private mode, SSR); collapsing
          // still works for the session, it just won't persist.
        }
        return next;
      });
    },
    [guildId],
  );

  return { collapsed, toggle };
}
