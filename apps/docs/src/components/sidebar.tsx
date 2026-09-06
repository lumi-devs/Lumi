"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation sections" className="grid gap-7">
      {navigation.map((group) => (
        <div key={group.title}>
          <p
            className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--fg-faint)" }}
          >
            {group.title}
          </p>
          <ul className="grid gap-0.5">
            {group.links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className="block rounded-lg px-3 py-1.5 text-[14px] transition-colors"
                    style={
                      active
                        ? {
                            background: "var(--accent-soft)",
                            color: "var(--fg)",
                            boxShadow: "inset 2px 0 0 var(--accent)",
                          }
                        : { color: "var(--fg-muted)" }
                    }
                  >
                    {link.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
