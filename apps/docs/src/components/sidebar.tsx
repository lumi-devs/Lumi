"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export const NAVIGATION = [
  {
    kicker: "// GETTING STARTED",
    title: "Getting Started",
    links: [
      { title: "Self-Hosting Guide", href: "/guides/self-hosting" },
      { title: "Configuration Reference", href: "/configuration" },
      { title: "Production Deployment", href: "/guides/production-deployment" }
    ]
  },
  {
    kicker: "// CORE ARCHITECTURE",
    title: "Core Architecture",
    links: [
      { title: "System Topology", href: "/architecture" },
      { title: "Distributed Sharding", href: "/sharding" },
      { title: "Event Bus & Redis", href: "/event-bus" },
      { title: "Database & Prisma", href: "/database" },
      { title: "Permissions & Permits", href: "/permissions" },
      { title: "Observability & Metrics", href: "/observability" },
      { title: "Core Modules", href: "/modules" },
      { title: "Web Admin Dashboard", href: "/dashboard" }
    ]
  },
  {
    kicker: "// ADDON SDK",
    title: "Addon SDK",
    links: [
      { title: "Quick Start Guide", href: "/guides/quick-start-addon" },
      { title: "Module Creation", href: "/guides/module-creation" },
      { title: "Publishing & Manifests", href: "/guides/addon-publishing" },
      { title: "API Reference", href: "/api-reference" }
    ]
  },
  {
    kicker: "// GOVERNANCE & HELP",
    title: "Governance & Help",
    links: [
      { title: "Data Privacy & GDPR", href: "/privacy" },
      { title: "License & Attribution", href: "/license" },
      { title: "FAQ", href: "/faq" },
      { title: "Troubleshooting", href: "/troubleshooting" }
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-16 z-30 -ml-2 hidden h-[calc(100vh-4rem)] w-full shrink-0 md:sticky md:block max-w-[260px] overflow-y-auto">
      <div className="h-full py-6 pr-6 lg:py-8">
        <div className="w-full space-y-8">
          {NAVIGATION.map((group, index) => (
            <div key={index} className="space-y-2">
              <div className="px-2.5">
                <span className="kicker-tag text-[10px] text-[var(--fg-subtle)] block">
                  {group.kicker}
                </span>
                <h4 className="text-xs font-bold text-[var(--fg)] tracking-tight mt-0.5">
                  {group.title}
                </h4>
              </div>
              <div className="grid grid-flow-row auto-rows-max text-xs space-y-0.5">
                {group.links.map((link, i) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={i}
                      href={link.href}
                      className={clsx(
                        "group flex w-full items-center rounded-xl px-3 py-2 transition-all",
                        isActive
                          ? "bg-[var(--accent-soft)] text-[var(--accent-fg)] border border-[var(--accent-border)] font-semibold shadow-[var(--shadow-sm)]"
                          : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] border border-transparent"
                      )}
                    >
                      <span>{link.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
