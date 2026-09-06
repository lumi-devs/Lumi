"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Navigation } from "@/lib/navigation";

export { Navigation };

export function Sidebar() {
  const pathname = usePathname();
  const currentPath = pathname ? pathname.replace(/\/$/, "") : "";

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Ensure the section containing the active page is always expanded
  useEffect(() => {
    for (const group of Navigation) {
      const hasActiveLink = group.links.some(
        (link) => link.href.replace(/\/$/, "") === currentPath
      );
      if (hasActiveLink) {
        setCollapsedSections((prev) => ({
          ...prev,
          [group.title]: false
        }));
        break;
      }
    }
  }, [currentPath]);

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  if (isCollapsed) {
    return (
      <aside className="fixed top-16 z-30 hidden h-[calc(100vh-4rem)] w-10 shrink-0 md:sticky md:flex flex-col items-center pt-6 border-r border-[var(--border)] transition-all duration-200">
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed top-16 z-30 hidden h-[calc(100vh-4rem)] w-56 shrink-0 md:sticky md:block pr-3 py-6 border-r border-[var(--border)] transition-all duration-200">
      {/* Sidebar Header with Collapse Button */}
      <div className="flex items-center justify-between px-2.5 pb-4 mb-4 border-b border-[var(--border-subtle)]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] font-mono">
          Docs Menu
        </span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="flex h-6 w-6 items-center justify-center rounded border border-transparent text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] hover:border-[var(--border)] transition-colors"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Navigation Groups with no-scrollbar */}
      <div className="h-[calc(100%-3rem)] overflow-y-auto no-scrollbar space-y-6 pb-8">
        {Navigation.map((group, index) => {
          const isSectionCollapsed = !!collapsedSections[group.title];
          const hasActiveChild = group.links.some(
            (link) => link.href.replace(/\/$/, "") === currentPath
          );

          return (
            <div key={index} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSection(group.title)}
                className="flex w-full items-center justify-between px-2.5 py-1 text-left group"
              >
                <span
                  className={clsx(
                    "text-[11px] font-bold uppercase tracking-wider font-mono transition-colors",
                    hasActiveChild
                      ? "text-[var(--accent-fg)]"
                      : "text-[var(--fg-subtle)] group-hover:text-[var(--fg-muted)]"
                  )}
                >
                  {group.title}
                </span>
                <ChevronDown
                  className={clsx(
                    "h-3 w-3 text-[var(--fg-subtle)] transition-transform duration-200 group-hover:text-[var(--fg)]",
                    isSectionCollapsed && "-rotate-90"
                  )}
                />
              </button>

              {!isSectionCollapsed && (
                <div className="space-y-0.5 pt-0.5">
                  {group.links.map((link, i) => {
                    const linkPath = link.href.replace(/\/$/, "");
                    const isActive = currentPath === linkPath;
                    return (
                      <Link
                        key={i}
                        href={`${linkPath}/`}
                        className={clsx(
                          "flex w-full items-center rounded-md px-2.5 py-1.5 transition-colors text-[13px] leading-tight",
                          isActive
                            ? "bg-[var(--surface-active)] text-white font-semibold border border-[var(--border-strong)] shadow-sm"
                            : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]"
                        )}
                      >
                        <span className="truncate">{link.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
