import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "#/lib/auth";
import { SiteHeader } from "#/components/layout/site-header";
import { GuildPicker } from "#/components/guild-picker";

export default async function GuildPickerPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <>
      <SiteHeader session={session} />
      <GuildPicker session={session} />
      <footer className="flex justify-center gap-3 py-6 text-[11px] text-fg-subtle">
        <Link href="/legal/privacy" className="underline hover:text-fg-muted">
          Privacy Policy
        </Link>
        <Link href="/legal/terms" className="underline hover:text-fg-muted">
          Terms of Service
        </Link>
      </footer>
    </>
  );
}
