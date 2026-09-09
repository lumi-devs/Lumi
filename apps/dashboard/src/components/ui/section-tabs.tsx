"use client";

import { useId, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";

export interface PageSection {
  /** Stable across renames — used for tab state and test queries, never shown. */
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Mono count beside the label; omit when a count would be meaningless. */
  count?: number;
  /** Red dot on the tab, for "something in here needs attention". */
  alert?: boolean;
  content: ReactNode;
}

/**
 * One page, several panels, one visible at a time. The tab strip mirrors the
 * grouped-settings strip in `ModuleConfigForm` so a settings page and a
 * hand-built page read the same way.
 *
 * Panels are `content` props rather than children so a server component can
 * pass server-rendered sections straight in.
 */
export function SectionTabs({
  sections,
  ariaLabel,
}: {
  sections: PageSection[];
  ariaLabel: string;
}) {
  const base = useId();
  const [active, setActive] = useState(sections[0]?.id);
  const current = sections.find((s) => s.id === active) ?? sections[0];

  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto rounded-panel border border-border bg-surface p-1.5"
      >
        {sections.map((section) => {
          const selected = section.id === current.id;
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              id={`${base}-tab-${section.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${section.id}`}
              onClick={() => setActive(section.id)}
              className={cn(
                "font-display inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold tracking-[0.02em] whitespace-nowrap transition-colors duration-fast",
                selected
                  ? "bg-accent-soft text-accent-fg"
                  : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
              )}
            >
              {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
              {section.label}
              {section.alert ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-danger"
                />
              ) : null}
              {typeof section.count === "number" ? (
                <span className="tabular text-[12px] opacity-70">{section.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-${current.id}`}
        aria-labelledby={`${base}-tab-${current.id}`}
        className="flex flex-col gap-4"
      >
        {current.content}
      </div>
    </div>
  );
}
