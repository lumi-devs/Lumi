"use client";

import { useEffect, useRef } from "react";

// dashboard.md §7 header wireframe: `[Search settings & modules...  ⌘K]`.
// This wires up the ⌘K focus affordance the wireframe calls for; it does not
// implement fuzzy search over modules/settings — that needs an indexed list
// of every module's config fields across the currently loaded guild, which
// isn't available at the header's scope. Left as a follow-up.
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
    <div className="relative hidden flex-1 max-w-md md:block">
      <input
        ref={ref}
        type="search"
        placeholder="Search settings & modules..."
        className="h-9 w-full rounded-lg border border-border bg-white/5 px-3 pr-10 text-sm text-white placeholder:text-white/30 outline-none focus:border-accent-cyan"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-white/40">
        ⌘K
      </kbd>
    </div>
  );
}
