"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { signOutAction } from "#/actions/auth-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

/** Avatar trigger + account popover — replaces the old avatar-link/sign-out-button
 * pair with a single menu, matching the pattern `GuildSwitcher` already uses. */
export function AccountMenu({
  username,
  avatar,
}: {
  username: string;
  avatar: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-2.5 pl-1 outline-none transition-colors hover:bg-surface-hover">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Discord CDN avatar, next/image adds no value here */}
        <img src={avatar} alt="" width={20} height={20} className="size-5 rounded-full" />
        <span className="max-w-[120px] truncate text-[14px] font-medium text-fg">
          {username}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-fg">{username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <User aria-hidden />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
