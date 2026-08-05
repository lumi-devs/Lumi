import { requireSession } from "#/lib/auth-guards";
import { SiteHeader } from "#/components/layout/site-header";
import { GdprExportCard } from "#/components/account/gdpr-export-card";

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <>
      <SiteHeader session={session} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-10 pb-24">
        <div>
          <h1 className="font-brand text-xl font-bold">Your data</h1>
          <p className="text-sm text-white/50">
            Everything Lumi has stored about your Discord account, across every
            server it shares with you.
          </p>
        </div>

        <GdprExportCard />
      </main>
    </>
  );
}
