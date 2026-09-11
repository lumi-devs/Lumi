"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "#/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

// Search box appears only for long lists — a two-item picker with a filter
// input is noise, not help.
const SearchThreshold = 7;

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  id,
  name,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const searchable = options.length >= SearchThreshold;
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function openList() {
    if (disabled) return;
    const index = Math.max(
      0,
      filtered.findIndex((o) => o.value === value),
    );
    setActive(index);
    setQuery("");
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setQuery("");
  }

  function choose(next: string) {
    if (next !== value) onValueChange(next);
    closeList();
  }

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) closeList();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, searchable]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function move(delta: number) {
    setActive((a) => Math.min(filtered.length - 1, Math.max(0, a + delta)));
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openList();
      else move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) {
        const current = filtered[active];
        if (e.key === "Enter" && current) choose(current.value);
      } else {
        openList();
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closeList();
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filtered[active];
      if (current) choose(current.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeList();
    } else if (e.key === "Tab") {
      closeList();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-control border border-border bg-bg-subtle px-2.5",
          "text-[15px] text-fg transition-colors outline-none",
          "hover:border-border-strong focus:border-accent focus:bg-surface",
          "disabled:cursor-not-allowed disabled:opacity-50",
          selected ? undefined : "text-fg-subtle",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-fg-subtle transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <div
          onKeyDown={onListKeyDown}
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-control border border-border bg-surface shadow-e3"
        >
          {searchable ? (
            <div className="border-b border-border p-1.5">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="h-8 w-full rounded-control border border-border bg-bg-subtle px-2.5 text-[14px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
            </div>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? "Options"}
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <li role="status" className="px-2.5 py-2 text-[14px] text-fg-subtle">
                No matches
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value || "__empty"}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-[14px]",
                      index === active ? "bg-accent-soft text-accent-fg" : "text-fg",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {isSelected ? (
                      <Check aria-hidden className="size-3.5 shrink-0" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
