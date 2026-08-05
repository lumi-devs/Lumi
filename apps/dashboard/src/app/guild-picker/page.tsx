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
    </>
  );
}
