import { ShieldCheck } from "lucide-react";
import { requireSession } from "#/lib/auth-guards";
import { SiteHeader } from "#/components/layout/site-header";
import { PageHeader } from "#/components/ui/page-header";
import { GdprExportCard } from "#/components/account/gdpr-export-card";

export default async function AccountPage() {
  const session = await requireSession();

  return (
    <>
      <SiteHeader session={session} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-10 pb-24">
        <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
          <PageHeader
            title="Your data"
            description="Everything Lumi has stored about your Discord account, across every server it shares with you."
            icon={ShieldCheck}
          />
        </div>

        <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
          <GdprExportCard />
        </div>
      </main>
    </>
  );
}
