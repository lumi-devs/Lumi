"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Session } from "next-auth";
import { AnimatePresence, motion } from "motion/react";
import {
  Home,
  IdCard as ServerIcon,
  Search,
  Terminal,
  User,
  type LucideIcon,
} from "lucide-react";
import { guildManagementGroups, guildTopLinks } from "#/lib/guild-nav";
import { SPRING_SNAPPY, useStaggerIn } from "#/lib/animate";
import { guildIconUrl } from "#/lib/discord-format";
import { cn } from "#/lib/utils";

interface PaletteItem {
  id: string;
  href: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  iconUrl?: string;
}

interface PaletteSection {
  title: string;
  items: PaletteItem[];
}

export function CommandPalette({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const pathname = usePathname();

  const currentGuildId = pathname?.match(/^\/guild\/([^/]+)/)?.[1];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const sections = useMemo<PaletteSection[]>(() => {
    if (!session) return [];
    const q = query.trim().toLowerCase();
    const matches = (label: string, extra?: string) =>
      q.length === 0 ||
      label.toLowerCase().includes(q) ||
      (extra?.toLowerCase().includes(q) ?? false);

    const result: PaletteSection[] = [];

    if (currentGuildId) {
      const items = [
        ...guildTopLinks(currentGuildId),
        ...guildManagementGroups(currentGuildId).flatMap((g) => g.links),
      ]
        .filter((l) => matches(l.label))
        .map((l) => ({ id: l.href, href: l.href, label: l.label, icon: l.icon }));
      if (items.length > 0) result.push({ title: "This server", items });
    }

    const guildItems = session.guilds
      .filter((g) => matches(g.name, g.id))
      .slice(0, q.length === 0 ? 6 : 20)
      .map((g) => ({
        id: `guild:${g.id}`,
        href: `/guild/${g.id}`,
        label: g.name,
        sublabel: g.id,
        icon: ServerIcon,
        iconUrl: guildIconUrl(g.id, g.icon) ?? undefined,
      }));
    if (guildItems.length > 0) result.push({ title: "Switch server", items: guildItems });

    const goto: PaletteItem[] = [
      { id: "home", href: "/guilds", label: "Your servers", icon: Home },
      { id: "account", href: "/account", label: "Your data", icon: User },
    ];
    if (session.isBotOwner) {
      goto.push({ id: "system", href: "/system", label: "System console", icon: Terminal });
    }
    const gotoItems = goto.filter((l) => matches(l.label));
    if (gotoItems.length > 0) result.push({ title: "Go to", items: gotoItems });

    return result;
  }, [session, query, currentGuildId]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Fires once per open, not per keystroke - tying this to the filtered
  // result set (as data-table.tsx's row stagger does) re-faded every visible
  // row on every character typed, which read as flicker rather than motion.
  const resultsRef = useStaggerIn<HTMLDivElement>("a", {
    resetKey: open,
  });

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeIndex];
      if (item) itemRefs.current.get(item.id)?.click();
    }
  }

  if (!session) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative hidden h-9 max-w-sm flex-1 items-center rounded-control border border-border bg-bg-subtle pr-12 pl-9 text-left text-[15.5px] text-fg-subtle transition-colors outline-none hover:border-border-strong md:flex"
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle"
        />
        Search servers and settings
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-control border border-border bg-surface px-1 py-px font-sans text-[12px] leading-4 text-fg-subtle">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={SPRING_SNAPPY}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-e3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 transition-colors focus-within:border-accent">
              <Search className="size-5 shrink-0 text-fg-subtle" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                type="text"
                placeholder="Search servers and settings…"
                aria-label="Search servers and settings"
                className="h-14 w-full bg-transparent text-[18px] text-fg outline-none! placeholder:text-fg-subtle"
              />
              <kbd className="shrink-0 rounded-control border border-border px-1.5 py-0.5 font-sans text-[13px] leading-4 text-fg-subtle">
                Esc
              </kbd>
            </div>

            <div ref={resultsRef} className="max-h-[28rem] overflow-y-auto p-2">
              {flat.length === 0 ? (
                <p className="px-3 py-8 text-center text-[16px] text-fg-subtle">
                  No matches for “{query}”
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.title} className="mb-1 last:mb-0">
                    <p className="font-display px-3 pt-2.5 pb-1.5 text-[14px] font-semibold tracking-[0.11em] text-fg-subtle uppercase">
                      {section.title}
                    </p>
                    {section.items.map((item) => {
                      const index = flat.indexOf(item);
                      const active = index === activeIndex;
                      return (
                        <Link
                          key={item.id}
                          ref={(el) => {
                            if (el) itemRefs.current.set(item.id, el);
                            else itemRefs.current.delete(item.id);
                          }}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-[16px] transition-colors",
                            active
                              ? "bg-accent-soft text-fg"
                              : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                          )}
                        >
                          {item.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- external Discord CDN icon, next/image adds no value here
                            <img
                              src={item.iconUrl}
                              alt=""
                              className="size-6 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <item.icon
                              className={cn(
                                "size-4 shrink-0",
                                active ? "text-accent-fg" : "text-fg-subtle",
                              )}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {item.label}
                          </span>
                          {item.sublabel && (
                            <span className="shrink-0 truncate font-mono text-[14px] text-fg-subtle">
                              {item.sublabel}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-[14px] text-fg-subtle">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-bg-subtle px-1 py-px font-sans">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-bg-subtle px-1 py-px font-sans">↵</kbd>
                Select
              </span>
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
