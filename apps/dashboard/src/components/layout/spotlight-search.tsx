"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

// Wires up the ⌘K focus affordance. It does not implement fuzzy search over
// modules/settings — that needs an indexed list of every module's config
// fields across the currently loaded guild, which isn't available at the
// header's scope. Left as a follow-up.
export function SpotlightSearch() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative hidden max-w-xs flex-1 md:block">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle"
      />
      <input
        ref={ref}
        type="search"
        placeholder="Search settings and modules"
        aria-label="Search settings and modules"
        className="h-8 w-full rounded-md border border-border bg-bg-subtle pr-12 pl-8 text-[13px] text-fg transition-colors outline-none placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:bg-surface [&::-webkit-search-cancel-button]:appearance-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border bg-surface px-1 py-px font-sans text-[10px] leading-4 text-fg-subtle">
        ⌘K
      </kbd>
    </div>
  );
}
