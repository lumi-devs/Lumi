"use client";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { VersionSelector } from "@/components/version-selector";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[#08090D]/85 backdrop-blur-xl">
      <div className="flex h-16 items-center px-6 lg:px-10 max-w-[1700px] mx-auto w-full gap-4">
        <div className="flex items-center gap-3.5 mr-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#4C6EF5] to-[#12B886] p-0.5 shadow-lg shadow-[#4C6EF5]/20 group-hover:scale-105 transition-transform">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#08090D]">
                <Sparkles className="h-4 w-4 text-[#748FFC]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-white tracking-tight leading-none">
                Lumi
              </span>
              <span className="kicker-tag text-[9px] text-[var(--fg-subtle)] leading-none mt-1">
                DOCUMENTATION
              </span>
            </div>
          </Link>
          <VersionSelector />
        </div>

        <div className="flex-1 flex justify-center max-w-md ml-auto sm:ml-0">
          <button className="w-full inline-flex items-center gap-2 whitespace-nowrap transition-all focus-visible:outline-none border border-[var(--border)] bg-[var(--surface)]/90 shadow-inner hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] px-4 py-2 relative h-9 justify-start rounded-xl text-xs text-[var(--fg-muted)]">
            <Search className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
            <span className="hidden lg:inline-flex">Search documentation...</span>
            <span className="inline-flex lg:hidden">Search...</span>
            <kbd className="pointer-events-none absolute right-[0.35rem] top-[0.35rem] hidden h-6 select-none items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-active)] px-2 font-mono text-[10px] font-semibold text-white sm:flex">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-4 ml-auto text-xs font-semibold">
          <Link
            href="https://discord.gg"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--fg-muted)] hover:text-[#748FFC] transition-colors"
          >
            Discord
          </Link>
          <Link
            href="https://github.com/lumi-devs/Lumi"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--fg-muted)] hover:text-white transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
