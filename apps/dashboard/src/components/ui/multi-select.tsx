"use client";

import { useState, useRef, useId } from "react";

interface MultiSelectOption {
  id: string;
  label: string;
}

interface MultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  disabled,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const available = options.filter(
    (o) => !value.includes(o.id) && o.label.toLowerCase().includes(query.toLowerCase()),
  );

  function select(id: string) {
    onChange([...value, id]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && query === "" && value.length > 0) {
      const last = value[value.length - 1];
      if (last !== undefined) remove(last);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
    if (e.key === "Enter" && available.length > 0) {
      e.preventDefault();
      const first = available[0];
      if (first !== undefined) select(first.id);
    }
  }

  const selectedLabels = value.map((id) => {
    const opt = options.find((o) => o.id === id);
    return { id, label: opt?.label ?? id };
  });

  return (
    <div className="relative flex w-full flex-col gap-1.5">
      <div
        className="border-input bg-background focus-within:ring-ring flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-sm focus-within:ring-2 focus-within:ring-offset-2"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedLabels.map(({ id, label }) => (
          <span
            key={id}
            className="bg-muted text-muted-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              disabled={disabled}
              className="hover:text-foreground ml-0.5 leading-none"
              onClick={(e) => {
                e.stopPropagation();
                remove(id);
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          placeholder={selectedLabels.length === 0 ? placeholder : ""}
          aria-label={ariaLabel}
          aria-controls={listId}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && available.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-popover absolute top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border py-1 shadow-md"
        >
          {available.map((opt) => (
            <li
              key={opt.id}
              role="option"
              aria-selected={false}
              className="hover:bg-accent cursor-pointer px-3 py-1.5 text-sm"
              onMouseDown={(e) => {
                e.preventDefault();
                select(opt.id);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
