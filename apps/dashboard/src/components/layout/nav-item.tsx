"use client";

import Link from "next/link";
import { cn } from "#/lib/utils";

/** Shared sidebar nav-link styling for the guild and system sidebars. */
export function NavItem({
  href,
  label,
  emoji,
  active,
  enabled,
}: {
  href: string;
  label: string;
  emoji: string;
  active?: boolean;
  enabled?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent-cyan/15 text-accent-cyan"
          : "text-white/60 hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="truncate">{label}</span>
      {enabled !== undefined && (
        <span
          className={cn(
            "ml-auto size-1.5 rounded-full",
            enabled ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-white/15",
          )}
        />
      )}
    </Link>
  );
}
