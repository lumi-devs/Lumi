import { auth } from "#/lib/auth";
import { SiteHeader } from "#/components/layout/site-header";
import { LandingPage } from "#/components/landing-page";
import { GuildPicker } from "#/components/guild-picker";

export default async function HomePage() {
  const session = await auth();
  return (
    <>
      <SiteHeader session={session} />
      {session ? <GuildPicker session={session} /> : <LandingPage />}
    </>
  );
}
