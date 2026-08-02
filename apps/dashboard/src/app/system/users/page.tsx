import { requireBotOwner } from "#/lib/auth-guards";
import { GdprForm } from "#/components/system/gdpr-form";

export default async function SystemUsersPage() {
  await requireBotOwner();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-brand text-xl font-bold">User Privacy</h1>
        <p className="text-sm text-white/50">Look up user preferences and trigger GDPR deletion.</p>
      </div>
      <GdprForm />
    </div>
  );
}
