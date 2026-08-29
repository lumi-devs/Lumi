"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { TocHeading } from "@/lib/docs";

export function TableOfContents({ toc }: { toc: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "0% 0% -80% 0%" }
    );

    toc.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [toc]);

  if (!toc || toc.length === 0) return null;

  return (
    <div className="hidden text-sm xl:block w-[250px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto py-8 pl-8">
      <div className="font-semibold text-[var(--fg)] mb-4">On This Page</div>
      <ul className="m-0 list-none space-y-2.5">
        {toc.map((item, i) => (
          <li key={i} className={clsx(item.depth === 3 && "ml-4")}>
            <a
              href={`#${item.id}`}
              className={clsx(
                "inline-block no-underline transition-colors hover:text-[var(--fg)]",
                activeId === item.id ? "text-[var(--accent)] font-medium" : "text-[var(--fg-subtle)]"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
