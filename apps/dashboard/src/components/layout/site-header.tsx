import Link from "next/link";
import type { Session } from "next-auth";
import { signOutAction } from "#/actions/auth-actions";
import { SpotlightSearch } from "./spotlight-search";

/** Sticky header — dashboard.md §7 wireframe row 1. */
export function SiteHeader({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border bg-[#04060c]/80 px-4 backdrop-blur-md md:px-6">
      <Link href="/" className="font-brand shrink-0 text-lg font-bold">
        <span className="brand-gradient-text">✦ Lumi</span>
      </Link>

      <SpotlightSearch />

      <div className="grow" />

      {session ? (
        <>
          {session.isBotOwner && (
            <Link
              href="/system"
              className="hidden text-sm font-medium text-white/60 hover:text-white sm:inline"
            >
              System Panel
            </Link>
          )}
          <div className="flex items-center gap-2 rounded-full border border-border bg-white/5 py-1 pr-3 pl-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- external Discord CDN avatar, next/image adds no value here */}
            <img
              src={session.avatar}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full"
            />
            <span className="max-w-[120px] truncate text-xs font-medium">
              {session.username}
            </span>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-white/50 hover:text-white"
            >
              Log out
            </button>
          </form>
        </>
      ) : (
        <Link
          href="/login"
          className="rounded-lg bg-accent-cyan px-4 py-2 text-sm font-semibold text-[#04060c]"
        >
          Login
        </Link>
      )}
    </header>
  );
}
