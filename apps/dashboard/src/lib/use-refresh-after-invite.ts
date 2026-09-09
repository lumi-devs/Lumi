"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Inviting the bot happens on discord.com, which leaves the dashboard tab
 * showing whatever it rendered before the invite. Discord ends the flow on its
 * own `/oauth2/authorized` page rather than returning here, so nothing
 * navigates this tab and the server sits on "Invite needed" until a manual
 * reload.
 *
 * `markPending` on the invite link, then the next time this tab is looked at
 * the server components re-run and the tile reflects the bot actually being in
 * the guild. Refreshing only after an invite keeps ordinary tab-switching from
 * refetching the whole list.
 */
export function useRefreshAfterInvite(): { markPending: () => void } {
  const router = useRouter();
  const pending = useRef(false);

  const markPending = useCallback(() => {
    pending.current = true;
  }, []);

  useEffect(() => {
    function onReturn() {
      if (!pending.current || document.visibilityState !== "visible") return;
      pending.current = false;
      router.refresh();
    }

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [router]);

  return { markPending };
}
