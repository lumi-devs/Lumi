"use client";
import Link from "next/link";
import { Search, BookOpen } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border)] glass">
      <div className="flex h-16 items-center px-6 max-w-7xl mx-auto w-full gap-4">
        <Link href="/" className="flex items-center gap-2 mr-4">
          <BookOpen className="h-6 w-6 text-[var(--accent)]" />
          <span className="font-bold text-lg hidden sm:inline-block">Lumi Docs</span>
          <span className="text-xs bg-[var(--surface-active)] px-2 py-0.5 rounded-full border border-[var(--border-strong)] text-[var(--fg-muted)]">v1.0.0-prealpha</span>
        </Link>
        <div className="flex-1 flex justify-center max-w-md ml-auto sm:ml-0">
          <button className="w-full inline-flex items-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-[var(--border)] bg-[var(--surface-hover)] shadow-sm hover:bg-[var(--surface-active)] hover:text-accent-foreground px-4 py-2 relative h-9 justify-start rounded-[0.5rem] text-sm text-[var(--fg-muted)]">
            <Search className="h-4 w-4" />
            <span className="hidden lg:inline-flex">Search documentation...</span>
            <span className="inline-flex lg:hidden">Search...</span>
            <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <Link href="https://discord.gg" target="_blank" rel="noreferrer" className="text-[var(--fg-muted)] hover:text-[var(--accent)] transition-colors">
            Discord
          </Link>
          <Link href="https://github.com/lumi" target="_blank" rel="noreferrer" className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
