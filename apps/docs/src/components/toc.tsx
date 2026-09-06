"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { TocHeading } from "@/lib/docs";

export function TableOfContents({ toc }: { toc: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const headings = (toc || []).filter((h) => h.depth > 1);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0% -60% 0%" }
    );

    headings.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="hidden text-xs xl:block w-[240px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto py-8 pl-6 border-l border-[var(--border)]">
      <div className="font-semibold text-white uppercase tracking-wider text-[11px] font-mono mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-fg)] inline-block" />
        <span>On this page</span>
      </div>
      <ul className="m-0 list-none space-y-2 border-l border-[var(--border-soft)] -ml-px">
        {headings.map((item, i) => {
          const isActive = activeId === item.id;
          return (
            <li key={i} className={clsx("relative", item.depth === 3 && "pl-3")}>
              <a
                href={`#${item.id}`}
                className={clsx(
                  "block py-0.5 pl-3 transition-colors text-xs leading-relaxed border-l-2 -ml-[2px]",
                  isActive
                    ? "text-[var(--accent-fg)] font-semibold border-[var(--accent)]"
                    : "text-[var(--fg-subtle)] hover:text-white border-transparent"
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
