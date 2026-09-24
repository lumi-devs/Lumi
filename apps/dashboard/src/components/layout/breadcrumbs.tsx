"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { guildManagementGroups, guildTopLinks } from "#/lib/guild-nav";

interface Crumb {
  label: string;
  href?: string;
}

// The sidebar is the single source of truth for where a page sits, so the trail
// is resolved against it rather than a second hand-maintained route table.
function resolveTrail(guildId: string, pathname: string): Crumb[] {
  const base = `/guild/${guildId}`;
  const groups = [
    { title: "", links: guildTopLinks(guildId) },
    ...guildManagementGroups(guildId),
  ];

  let match: { label: string; href: string } | null = null;
  for (const group of groups) {
    for (const link of group.links) {
      if (link.href === base) continue;
      const hit = pathname === link.href || pathname.startsWith(`${link.href}/`);
      if (hit && (!match || link.href.length > match.href.length)) {
        match = { label: link.label, href: link.href };
      }
    }
  }

  if (!match) return [];

  // Group titles ("Configuration", ...) are structural buckets without their
  // own page — a crumb with nowhere to go adds no navigation value, so only
  // the linked match trails.
  const trail: Crumb[] = [
    {
      label: match.label,
      ...(pathname === match.href ? {} : { href: match.href }),
    },
  ];

  const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
  for (const [index, segment] of rest.entries()) {
    trail.push({
      label: prettifySegment(segment),
      ...(index === rest.length - 1
        ? {}
        : { href: `${match.href}/${rest.slice(0, index + 1).join("/")}` }),
    });
  }

  return trail;
}

// Slugs read better with spaces; IDs and hashes pass through untouched.
function prettifySegment(segment: string): string {
  const text = decodeURIComponent(segment);
  if (/^\d+$/.test(text)) return text;
  return text.replace(/[-_]+/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] !== "guild" || !parts[1]) return null;

  const guildId = parts[1];
  const base = `/guild/${guildId}`;
  const trail = resolveTrail(guildId, pathname);

  if (trail.length === 0) return null;

  const crumbs: Crumb[] = [{ label: "Dashboard", href: base }, ...trail];

  return (
    <nav aria-label="Breadcrumb" className="mb-4 overflow-x-auto">
      <ol className="flex w-max items-center gap-1 text-[13px]">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="whitespace-nowrap text-fg-muted transition-colors hover:text-fg hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="whitespace-nowrap font-medium text-fg">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
