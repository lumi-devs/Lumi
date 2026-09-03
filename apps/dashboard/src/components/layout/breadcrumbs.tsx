"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "#/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "/guild/[guildId]": "Dashboard",
  "/guild/[guildId]/moderation": "Moderation Cases",
  "/guild/[guildId]/warn-thresholds": "Warn Thresholds",
  "/guild/[guildId]/blocklist": "Blocklist",
  "/guild/[guildId]/mod-notes": "Mod Notes",
  "/guild/[guildId]/appeals": "Appeals",
  "/guild/[guildId]/security": "Panic & Verification",
  "/guild/[guildId]/overrides": "Overrides",
  "/guild/[guildId]/permits": "Permits",
  "/guild/[guildId]/health": "Health Dashboard",
  "/guild/[guildId]/audit": "Audit Log",
  "/guild/[guildId]/tempvc": "Voice Generators",
  "/guild/[guildId]/history": "Settings History",
  "/guild/[guildId]/advanced": "Advanced",
  "/guild/[guildId]/modules": "Modules & Addons",
  "/guild/[guildId]/addons": "Addons",
  "/guild/[guildId]/setup": "Guided Setup",
  "/guild/[guildId]/modules/[moduleName]": "Module Configuration",
};

const CATEGORY_MAP: Record<string, string> = {
  moderation: "Discipline & Appeals",
  "warn-thresholds": "Discipline & Appeals",
  blocklist: "Discipline & Appeals",
  "mod-notes": "Discipline & Appeals",
  appeals: "Discipline & Appeals",
  security: "Safety & Security",
  overrides: "Safety & Security",
  permits: "Community & Engagement",
  health: "Monitoring & Diagnostics",
  audit: "Monitoring & Diagnostics",
  tempvc: "Configuration",
  history: "Configuration",
  advanced: "Configuration",
  modules: "Configuration",
  addons: "Overview",
  setup: "Overview",
};

function getPathSegments(pathname: string): Array<{ segment: string; href: string }> {
  const parts = pathname.split("/").filter(Boolean);
  const segments: Array<{ segment: string; href: string }> = [];

  if (parts[0] === "guild" && parts[1]) {
    const guildId = parts[1];
    const baseUrl = `/guild/${guildId}`;

    segments.push({ segment: guildId, href: baseUrl });

    if (parts[2]) {
      const category = parts[2];
      const categoryLabel = CATEGORY_MAP[category] || category;
      if (categoryLabel) {
        segments.push({
          segment: categoryLabel,
          href: parts[3] ? `${baseUrl}/${category}` : "",
        });
      }

      if (parts[3]) {
        const moduleName = parts[3];
        segments.push({ segment: moduleName, href: `${baseUrl}/${category}/${moduleName}` });
      }
    }
  }

  return segments;
}

function getPageLabel(pathname: string, guildId: string): string {
  const pattern = pathname
    .replace(`/guild/${guildId}`, "/guild/[guildId]")
    .replace(/\/[^/]+$/, "/[moduleName]");

  return ROUTE_LABELS[pattern] || ROUTE_LABELS[pathname.replace(`/guild/${guildId}`, "/guild/[guildId]")] || "Page";
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const guildId = parts[1];

  if (!guildId || parts[0] !== "guild") {
    return null;
  }

  const segments = getPathSegments(pathname);
  const pageLabel = getPageLabel(pathname, guildId);

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center gap-1 text-sm">
        {segments.map((item, index) => (
          <li key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden className="size-3.5 text-fg-muted" />}
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "transition-colors",
                  "text-fg-muted hover:text-fg hover:underline",
                  index === 0 && "font-mono text-[12px]",
                )}
              >
                {item.segment}
              </Link>
            ) : (
              <span className="text-fg-muted">{item.segment}</span>
            )}
          </li>
        ))}
        {pageLabel && (
          <>
            <li className="flex items-center gap-1">
              <ChevronRight aria-hidden className="size-3.5 text-fg-muted" />
            </li>
            <li className="text-fg font-medium">{pageLabel}</li>
          </>
        )}
      </ol>
    </nav>
  );
}
