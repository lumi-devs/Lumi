import Link from "next/link";
import type { Session } from "next-auth";
import { Terminal } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";
import { AccountMenu } from "./account-menu";
import { buttonVariants } from "#/components/ui/button-variants";

export function SiteHeader({
  session,
  compact,
  panicArmed,
}: {
  session: Session | null;
  /** Drops the wordmark on sidebar layouts, where the rail already brands the page. */
  compact?: boolean;
  /** Guild-scoped only — shows a live "panic mode armed" pill when true. */
  panicArmed?: boolean;
}) {
  return (
    <header className="glass sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border px-4 md:px-6">
      {compact ? null : (
        <Link href="/" className="shrink-0" aria-label="Lumi home">
          <Wordmark />
        </Link>
      )}

      <CommandPalette session={session} />

      {panicArmed ? (
        <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 font-mono text-[12.5px] text-danger-fg">
          <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-danger" />
          panic mode armed
        </span>
      ) : null}

      <div className="grow" />

      {session ? (
        <>
          {session.isBotOwner && (
            <Link
              href="/system"
              className={buttonVariants({ variant: "ghost", size: "md" })}
            >
              <Terminal aria-hidden />
              <span className="hidden sm:inline">System</span>
            </Link>
          )}

          <ThemeToggle />

          <AccountMenu username={session.username} avatar={session.avatar} />
        </>
      ) : (
        <>
          <ThemeToggle />
          <Link
            href="/login"
            className={buttonVariants({ variant: "primary", size: "md" })}
          >
            Login
          </Link>
        </>
      )}
    </header>
  );
}
