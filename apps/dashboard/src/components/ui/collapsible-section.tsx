"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "#/lib/utils";

export function CollapsibleSection({
  title,
  count,
  countLabel,
  defaultOpen = true,
  open,
  onOpenChange,
  className,
  children,
}: {
  title: ReactNode;
  count?: number;
  /** Singular noun; pluralised with a trailing "s". */
  countLabel?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = open ?? uncontrolled;

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  }

  return (
    <div className={className}>
      <h4>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className={cn(
            "font-display flex w-full items-baseline gap-2 border-y border-border bg-bg-subtle px-4 py-1.5 text-left text-[13px] font-semibold tracking-[0.09em] text-fg-subtle uppercase transition-colors duration-fast hover:bg-surface-hover hover:text-fg",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 self-center transition-transform duration-fast",
              isOpen && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">{title}</span>
          {count !== undefined ? (
            <span aria-hidden className="tabular shrink-0 normal-case opacity-70">
              {count}
              {countLabel
                ? ` ${countLabel}${count === 1 ? "" : "s"}`
                : ""}
            </span>
          ) : null}
        </button>
      </h4>
      <div id={bodyId} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
