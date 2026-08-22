"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "./button";
import { Field, Input, Select } from "./input";
import { cn } from "#/lib/utils";

// Filters navigate with `replace`, not `push`, so a debounced search box does
// not fill the back stack — unlike pagination, which uses real links.

export type FilterField =
  | {
      type: "search";
      name: string;
      label: string;
      placeholder?: string;
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
      /** Autocomplete suggestions (e.g. known member IDs) via a native <datalist> - the field still accepts any typed value, so it works for entities the suggestion list doesn't cover (a banned/departed member, for instance). */
      suggestions?: { value: string; label: string }[];
    }
  | {
      type: "select";
      name: string;
      label: string;
      anyLabel: string;
      options: { value: string; label: string }[];
    };

const DEBOUNCE_MS = 350;

export function FilterBar({
  fields,
  className,
  resetParams = [],
}: {
  fields: FilterField[];
  className?: string;
  resetParams?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const groupId = useId();

  const query = searchParams.toString();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drafts are reset during render, not in an effect, so a back/forward
  // navigation never paints a stale value.
  const [state, setState] = useState(() => ({
    query,
    drafts: readValues(fields, searchParams),
  }));
  if (state.query !== query) {
    setState({ query, drafts: readValues(fields, searchParams) });
  }
  const drafts = state.drafts;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function commit(next: Record<string, string>) {
    const params = new URLSearchParams(query);
    for (const field of fields) {
      const value = next[field.name]?.trim() ?? "";
      if (value) params.set(field.name, value);
      else params.delete(field.name);
    }
    params.delete("page");
    for (const name of resetParams) params.delete(name);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function update(name: string, value: string, debounce: boolean) {
    const next = { ...drafts, [name]: value };
    setState({ query, drafts: next });
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
    else commit(next);
  }

  const hasFilters = fields.some((f) => (drafts[f.name] ?? "") !== "");

  return (
    <form
      role="search"
      aria-busy={isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        commit(drafts);
      }}
      className={cn(
        "flex flex-wrap items-end gap-x-3 gap-y-3 px-4 py-3",
        className,
      )}
    >
      {fields.map((field) => {
        const id = `${groupId}-${field.name}`;
        const value = drafts[field.name] ?? "";
        return (
          <Field
            key={field.name}
            htmlFor={id}
            label={field.label}
            className="min-w-[10rem] flex-1 basis-44 gap-1"
          >
            {field.type === "search" ? (
              <>
                <Input
                  id={id}
                  name={field.name}
                  type="search"
                  value={value}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  list={field.suggestions ? `${id}-list` : undefined}
                  onChange={(e) => update(field.name, e.target.value, true)}
                />
                {field.suggestions ? (
                  <datalist id={`${id}-list`}>
                    {field.suggestions.map((s) => (
                      <option key={s.value} value={s.value} label={s.label} />
                    ))}
                  </datalist>
                ) : null}
              </>
            ) : (
              <Select
                id={id}
                name={field.name}
                value={value}
                onChange={(e) => update(field.name, e.target.value, false)}
              >
                <option value="">{field.anyLabel}</option>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        );
      })}

      <div className="flex items-center gap-2 pb-px">
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => commit({})}
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
        <span
          aria-live="polite"
          className="font-display text-[13px] tracking-[0.02em] text-fg-subtle"
        >
          {isPending ? "Updating…" : ""}
        </span>
      </div>
    </form>
  );
}

function readValues(
  fields: FilterField[],
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) values[field.name] = params.get(field.name) ?? "";
  return values;
}

interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null;
  toString(): string;
}
