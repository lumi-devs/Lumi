import Link from "next/link";
import type { Session } from "next-auth";
import { LogOut, Terminal } from "lucide-react";
import { signOutAction } from "#/actions/auth-actions";
import { SpotlightSearch } from "./spotlight-search";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";
import { Button, buttonVariants } from "#/components/ui/button";

/**
 * Sticky app bar. 56px instead of 64px, hairline bottom border instead of a
 * blurred translucent panel — at this size the header is chrome, not a
 * feature, and it should not visually compete with the page title beneath it.
 */
export function SiteHeader({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-sm md:px-6">
      <Link href="/" className="shrink-0" aria-label="Lumi home">
        <Wordmark />
      </Link>

      <SpotlightSearch />

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

          <div className="flex items-center gap-2 rounded-md border border-border bg-surface py-1 pr-2.5 pl-1">
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
          </div>

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
