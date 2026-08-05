"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { StatusDot } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

/**
 * Shared sidebar link. 28px tall with a 14px icon — the previous 40px rows
 * pushed the module list below the fold on a laptop.
 *
 * Active state is a filled surface plus a full-strength label rather than an
 * accent-tinted pill: in a sidebar of 20 items, one tinted block is enough
 * signal, and it survives both themes without the accent glowing on white.
 */
export function NavItem({
  href,
  label,
  icon: Icon,
  leading,
  active,
  enabled,
}: {
  href: string;
  label: string;
  /** Chrome icon (lucide). Mutually exclusive with `leading`. */
  icon?: LucideIcon;
  /** Custom leading element — used for module glyph tiles. */
  leading?: React.ReactNode;
  active?: boolean;
  /** When provided, renders a trailing enabled/disabled status dot. */
  enabled?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-display group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] tracking-[0.01em] transition-colors",
        // Active route carries a 2px cobalt tick in the gutter — the console
        // "you are here" mark. Colour alone would be a second accent surface.
        active
          ? "bg-surface-active font-semibold text-fg shadow-[inset_2px_0_0_0_var(--accent)]"
          : "font-medium text-fg-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      {leading ??
        (Icon ? (
          <Icon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0",
              active ? "text-fg" : "text-fg-subtle group-hover:text-fg-muted",
            )}
          />
        ) : null)}
      <span className="truncate">{label}</span>
      {enabled !== undefined && (
        <StatusDot
          active={enabled}
          className="ml-auto"
          title={enabled ? "Enabled" : "Disabled"}
        />
      )}
    </Link>
  );
}

/** Small uppercase section label above a group of nav items. */
export function NavSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex h-6 items-center gap-2 px-2">
        <p className="font-display text-[11px] font-semibold tracking-[0.11em] text-fg-subtle uppercase">
          {title}
        </p>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}
