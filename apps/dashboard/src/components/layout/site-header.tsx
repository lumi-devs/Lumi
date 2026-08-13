import Link from "next/link";
import type { Session } from "next-auth";
import { LogOut, Terminal } from "lucide-react";
import { signOutAction } from "#/actions/auth-actions";
import { CommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";
import { Button } from "#/components/ui/button";
import { buttonVariants } from "#/components/ui/button-variants";

export function SiteHeader({
  session,
  compact,
}: {
  session: Session | null;
  /** Drops the wordmark on sidebar layouts, where the rail already brands the page. */
  compact?: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-sm md:px-6">
      {compact ? null : (
        <Link href="/" className="shrink-0" aria-label="Lumi home">
          <Wordmark />
        </Link>
      )}

      <CommandPalette session={session} />

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

          <Link
            href="/account"
            className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2.5 pl-1 transition-colors hover:bg-surface-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external Discord CDN avatar, next/image adds no value here */}
            <img
              src={session.avatar}
              alt=""
              width={20}
              height={20}
              className="size-5 rounded-full"
            />
            <span className="max-w-[120px] truncate text-[12px] font-medium text-fg">
              {session.username}
            </span>
          </Link>

          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut aria-hidden />
            </Button>
          </form>
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
