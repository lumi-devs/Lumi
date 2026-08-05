import { BadgeCheck, ShieldAlert } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";
import { PageHeader } from "#/components/ui/page-header";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Security"
        description="Raid response and member verification for this server."
      />
      <StubPage
        icon={ShieldAlert}
        title="Panic Mode"
        specComponent="PanicModeLockdownWidget"
        models={["PanicState"]}
        description="Instant raid-response lockdown: pause invites and lock channels."
      />
      <StubPage
        icon={BadgeCheck}
        title="Verification Panel"
        specComponent="VerificationPanelCard"
        models={["VerificationPanel"]}
        description="Deploy a button/captcha verification panel to a channel."
      />
    </div>
  );
}
