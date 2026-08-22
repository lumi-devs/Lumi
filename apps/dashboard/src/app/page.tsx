import { auth } from "#/lib/auth";
import { SiteHeader } from "#/components/layout/site-header";
import { LandingPage } from "#/components/landing-page";

// The root is always the public marketing page, signed in or not - the
// header still reflects real auth state (avatar/System/logout vs Login), but
// "your servers" lives at its own route (/guilds) rather than replacing this
// one conditionally.
export default async function HomePage() {
  const session = await auth();
  return (
    <>
      <SiteHeader session={session} />
      <LandingPage />
    </>
  );
}
