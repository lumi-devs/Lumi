"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "#/components/ui/sheet";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { SpringSnappy } from "#/lib/animate";
import type { GuildNavGroup } from "#/lib/guild-nav";

// Why this whole tree is a Client Component: `GuildNavGroup.icon` holds raw
// Lucide *component references*, and a Server Component handing those to a
// client child crashes the route ("Functions cannot be passed directly to
// Client Components"). The nav data is therefore resolved on the client side
// of the boundary; layouts pass only plain strings.

/**
 * Three widths, no dead ends: a full rail from `lg` up, a 64px icon-only rail
 * between `md` and `lg`, and a slide-out drawer below `md` driven by the
 * trigger this component also renders.
 */
export function SideNav({
  groups,
  tag,
  switcher,
  footer,
}: {
  groups: GuildNavGroup[];
  /** Mono kicker under the wordmark — "DASHBOARD" / "SYSTEM". */
  tag: string;
  /** Guild switcher card (or any header block) shown above the nav groups. */
  switcher?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A drawer left open across a navigation would cover the page it just
  // opened, so it closes whenever the route changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-16 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border-soft bg-surface px-2 py-5 md:flex lg:w-58 lg:gap-5 lg:px-3">
        <SideNavBody
          groups={groups}
          tag={tag}
          switcher={switcher}
          footer={footer}
          pathname={pathname}
        />
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed bottom-4 left-4 z-50 border border-border bg-surface shadow-e2 md:hidden"
            aria-label="Open navigation"
          >
            <PanelLeft aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 gap-5 overflow-y-auto border-border-soft bg-surface px-3 py-5 data-[side=left]:w-72"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SideNavBody
            groups={groups}
            tag={tag}
            switcher={switcher}
            footer={footer}
            pathname={pathname}
            forceExpanded
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

const OpenGroupsKey = "lumi.nav.open-groups";

// Both helpers swallow their failure: a browser with site data blocked throws on
// access, and the nav must still render with its static defaults.
function readOpenGroups(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(OpenGroupsKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, boolean>)
      : null;
  } catch {
    return null;
  }
}

function writeOpenGroups(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(OpenGroupsKey, JSON.stringify(state));
  } catch {
    return;
  }
}

// `forceExpanded` drops the `lg:` gating inside the drawer, where the rail's
// icon-only width never applies.
function SideNavBody({
  groups,
  tag,
  switcher,
  footer,
  pathname,
  forceExpanded = false,
}: {
  groups: GuildNavGroup[];
  tag: string;
  switcher?: React.ReactNode;
  footer?: React.ReactNode;
  pathname: string;
  forceExpanded?: boolean;
}) {
  // Literal class strings, not interpolated ones — Tailwind only emits
  // utilities it can find verbatim in the source.
  const labelBlock = forceExpanded ? "block" : "hidden lg:block";
  const labelInline = forceExpanded ? "inline" : "hidden lg:inline";

  // Nested routes make several hrefs match at once (`/moderation` and
  // `/moderation/thresholds`); only the most specific one gets the pill, or two
  // live `layoutId` pills would fight over the same animation.
  const activeHref = groups
    .flatMap((group) => group.links.map((link) => link.href))
    .filter((href) => isActive(pathname, href))
    .sort((a, b) => b.length - a.length)[0];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.title, g.collapsible ? (g.defaultOpen ?? true) : true]),
    ),
  );

  // Restored after mount rather than in the initializer: the server has no
  // localStorage, and a different first paint would fail hydration.
  useEffect(() => {
    const saved = readOpenGroups();
    if (saved) setOpenGroups((prev) => ({ ...prev, ...saved }));
  }, []);

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [title]: !(prev[title] ?? true) };
      writeOpenGroups(next);
      return next;
    });

  return (
    <>
      <div className="flex items-center gap-2.5 px-1 lg:px-2">
        <span
          aria-hidden
          className="size-6.5 shrink-0 rounded-[7px] bg-linear-155 from-accent to-accent-hover"
        />
        <span className={cn("min-w-0", labelBlock)}>
          <span className="font-display block text-[17px] leading-5 font-bold tracking-[0.01em] text-fg">
            Lumi
          </span>
          <span className="block font-mono text-[12px] tracking-[0.08em] text-fg-subtle uppercase">
            {tag}
          </span>
        </span>
      </div>

      {switcher ? (
        <div className={cn(labelBlock)}>{switcher}</div>
      ) : null}

      <nav className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto">
        {groups.map((group) => {
          const isOpen = openGroups[group.title] ?? true;
          const HeaderTag = group.collapsible ? "button" : "p";
          return (
          <div key={group.title}>
            <HeaderTag
              type={group.collapsible ? "button" : undefined}
              aria-expanded={group.collapsible ? isOpen : undefined}
              onClick={group.collapsible ? () => toggleGroup(group.title) : undefined}
              className={cn(
                "font-display mb-1.5 flex w-full items-center gap-1 px-2.5 text-[12px] font-semibold tracking-[0.1em] text-fg-subtle uppercase",
                group.collapsible && "cursor-pointer transition-colors hover:text-fg",
                labelBlock,
              )}
            >
              {group.collapsible ? (
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 transition-transform duration-200",
                    isOpen && "rotate-90",
                  )}
                />
              ) : null}
              <span className="truncate">{group.title}</span>
              {group.alertDot ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-danger"
                />
              ) : null}
              {group.badge !== undefined ? (
                <span className="ml-auto font-mono text-[11px] font-normal tracking-normal text-fg-subtle">
                  {group.badge}
                </span>
              ) : null}
            </HeaderTag>
            {/* The icon rail has no group labels, so a hairline keeps the
             * grouping legible at 64px instead of one undifferentiated list. */}
            {!forceExpanded ? (
              <span
                aria-hidden
                className="mx-2 mb-1.5 block h-px bg-border-soft lg:hidden"
              />
            ) : null}
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.ul
                  initial={group.collapsible ? { opacity: 0, height: 0 } : false}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-px overflow-hidden"
                >
              {group.links.map((link) => {
                const active = link.href === activeHref;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      title={link.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-control px-2.5 text-[15px] transition-colors",
                        // The drawer is the touch surface, so its rows clear the
                        // 44px minimum target; the pointer-driven rail stays dense.
                        forceExpanded ? "py-3" : "justify-center py-1.5 lg:justify-start",
                        active
                          ? "text-accent-fg"
                          : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                      )}
                    >
                      {active ? (
                        // Namespaced per rail/drawer instance - both can be
                        // mounted simultaneously (drawer open on mobile), and
                        // a shared layoutId across two live instances fights
                        // itself.
                        <motion.span
                          layoutId={forceExpanded ? "nav-pill-drawer" : "nav-pill-rail"}
                          className="absolute inset-0 rounded-control bg-accent-soft"
                          transition={SpringSnappy}
                        />
                      ) : null}
                      <link.icon
                        aria-hidden
                        className={cn(
                          "relative z-10 size-4 shrink-0",
                          active ? "text-accent-fg" : "text-fg-subtle",
                        )}
                      />
                      <span className={cn("relative z-10 truncate", labelInline)}>
                        {link.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
                </motion.ul>
              ) : null}
            </AnimatePresence>
          </div>
          );
        })}
      </nav>

      {footer ? (
        <div className={cn("border-t border-border-soft pt-3", labelBlock)}>
          {footer}
        </div>
      ) : null}
    </>
  );
}

export function SideNavUser({
  username,
  avatar,
  role,
}: {
  username: string;
  avatar: string;
  role: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/account"
        className="flex items-center gap-2 rounded-control px-1 py-1 transition-colors hover:bg-surface-hover"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external Discord CDN avatar */}
        <img src={avatar} alt="" className="size-6.5 shrink-0 rounded-full" />
        <span className="min-w-0">
          <span className="font-display block truncate text-[14px] font-semibold text-fg">
            {username}
          </span>
          <span className="block font-mono text-[12.5px] text-fg-subtle">
            {role}
          </span>
        </span>
      </Link>
      <div className="flex gap-2 px-1 text-[12px] text-fg-subtle">
        <Link href="/legal/privacy" className="underline hover:text-fg-muted">
          Privacy
        </Link>
        <Link href="/legal/terms" className="underline hover:text-fg-muted">
          Terms
        </Link>
      </div>
    </div>
  );
}

// Section roots (`/guild/:id/modules`) stay lit while a child page
// (`.../modules/tempvc`) is open; the guild/system index links would otherwise
// match every descendant, so those match exactly.
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const segments = href.split("/").filter(Boolean).length;
  const isSectionRoot = href.startsWith("/system") ? segments > 1 : segments > 2;
  return isSectionRoot && pathname.startsWith(`${href}/`);
}
