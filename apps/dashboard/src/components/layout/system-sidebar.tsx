"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  ClipboardList,
  Globe,
  Network,
  Package,
  Power,
  ShieldUser,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "/system", label: "Global Config", icon: Globe },
  { href: "/system/modules", label: "Module Kill-Switches", icon: Power },
  { href: "/system/addons", label: "Addon Repositories", icon: Package },
  { href: "/system/blocklist", label: "Global Blocklist", icon: Ban },
  { href: "/system/audit", label: "System Audit Log", icon: ClipboardList },
  { href: "/system/users", label: "User Privacy / GDPR", icon: ShieldUser },
  { href: "/system/shards", label: "Sharding Telemetry", icon: Network },
];

export function SystemSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link href="/" aria-label="Lumi home" className="flex items-center gap-2 px-2 py-1.5">
          <Wordmark />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>System Panel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LINKS.map((l) => (
                <SidebarMenuItem key={l.href}>
                  <SidebarMenuButton asChild isActive={pathname === l.href}>
                    <Link href={l.href}>
                      <l.icon aria-hidden />
                      <span>{l.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
