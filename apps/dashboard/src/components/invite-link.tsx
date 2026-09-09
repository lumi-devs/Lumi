"use client";

import type { ReactNode } from "react";
import { inviteUrlFor } from "#/lib/invite";
import { useRefreshAfterInvite } from "#/lib/use-refresh-after-invite";

/**
 * Discord ends a bot invite on its own `/oauth2/authorized` page and never
 * navigates this tab, so the page that offered the invite keeps rendering
 * "Invite needed" until something refetches. This refreshes when the tab is
 * looked at again — which is also the whole fix when no return URL is set.
 */
export function InviteLink({
  clientId,
  guildId,
  returnTo,
  className,
  children,
}: {
  clientId: string;
  guildId: string;
  /** `<origin>/oauth/guild`, when the operator has configured it. */
  returnTo?: string;
  className?: string;
  children: ReactNode;
}) {
  const { markPending } = useRefreshAfterInvite();

  return (
    <a
      href={inviteUrlFor(clientId, guildId, returnTo)}
      target="_blank"
      rel="noreferrer"
      onClick={markPending}
      className={className}
    >
      {children}
    </a>
  );
}
