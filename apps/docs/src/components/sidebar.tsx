"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export const NAVIGATION = [
  {
    title: "Getting Started",
    links: [
      { title: "Self Hosting", href: "/guides/self-hosting" },
      { title: "Configuration", href: "/configuration" },
      { title: "Production Deployment", href: "/guides/production-deployment" }
    ]
  },
  {
    title: "Core Architecture",
    links: [
      { title: "Architecture", href: "/architecture" },
      { title: "Modules", href: "/modules" },
      { title: "Dashboard", href: "/dashboard" },
      { title: "FAQ", href: "/faq" },
      { title: "Troubleshooting", href: "/troubleshooting" }
    ]
  },
  {
    title: "Addon Development",
    links: [
      { title: "Quick Start", href: "/guides/quick-start-addon" },
      { title: "Module Creation", href: "/guides/module-creation" },
      { title: "Publishing", href: "/guides/addon-publishing" }
    ]
  },
  {
    title: "API Reference",
    links: [
      { title: "API Reference", href: "/api-reference" }
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-16 z-30 -ml-2 hidden h-[calc(100vh-4rem)] w-full shrink-0 md:sticky md:block max-w-[240px] overflow-y-auto">
      <div className="h-full py-6 pr-6 lg:py-8">
        <div className="w-full">
          {NAVIGATION.map((group, index) => (
            <div key={index} className="pb-8">
              <h4 className="mb-1 rounded-md px-2 py-1 text-sm font-semibold text-[var(--fg)]">
                {group.title}
              </h4>
              <div className="grid grid-flow-row auto-rows-max text-sm">
                {group.links.map((link, i) => (
                  <Link
                    key={i}
                    href={link.href}
                    className={clsx(
                      "group flex w-full items-center rounded-md border border-transparent px-2 py-1 hover:underline",
                      pathname === link.href
                        ? "text-[var(--accent)] font-medium"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    )}
                  >
                    {link.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
