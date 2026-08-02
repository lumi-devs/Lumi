import { requireGuild } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuild(guildId);
  return (
    <div className="flex flex-col gap-6">
      <StubPage
        emoji="🚨"
        title="Panic Mode"
        specComponent="PanicModeLockdownWidget"
        models={["PanicState"]}
        description="Instant raid-response lockdown: pause invites and lock channels."
      />
      <StubPage
        emoji="✅"
        title="Verification Panel"
        specComponent="VerificationPanelCard"
        models={["VerificationPanel"]}
        description="Deploy a button/captcha verification panel to a channel."
      />
    </div>
  );
}
