import { requireBotOwner } from "#/lib/auth-guards";
import { GdprForm } from "#/components/system/gdpr-form";
import { PageHeader } from "#/components/ui/page-header";

export default async function SystemUsersPage() {
  await requireBotOwner();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="User Privacy"
        description="Look up user preferences and trigger GDPR deletion."
      />
      <GdprForm />
    </div>
  );
}
