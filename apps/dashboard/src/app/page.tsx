import { auth } from "#/lib/auth";
import { SiteHeader } from "#/components/layout/site-header";
import { LandingPage } from "#/components/landing-page";
import { GuildPicker } from "#/components/guild-picker";

// dashboard.md §11: `GET /` — landing page (unauthed) or server picker (authed).
export default async function HomePage() {
  const session = await auth();
  return (
    <>
      <SiteHeader session={session} />
      {session ? <GuildPicker session={session} /> : <LandingPage />}
    </>
  );
}
