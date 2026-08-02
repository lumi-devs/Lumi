import { requireGuild } from "#/lib/auth-guards";
import { getGuildDashboard } from "#/lib/dashboard-fetch";
import { StatsGrid } from "#/components/stats-grid";
import { GeneralSettingsForm } from "#/components/guild/general-settings-form";

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const data = await getGuildDashboard(guildId, session.userId);

  const enabledCount = data.modules.filter(
    (m) => m.enabled || m.name === "core",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {data.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.icon} alt="" className="size-12 rounded-xl object-cover" />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/10 text-lg font-bold">
            {data.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-brand text-xl font-bold">{data.name}</h1>
          <p className="font-mono text-xs text-white/40">{guildId}</p>
        </div>
      </div>

      {/* Stats grid — dashboard.md §7 wireframe. Member/threat/VC counts need
       * a dedicated stats RPC action this rewrite doesn't add yet (no
       * §10 contract exists for it); module + guild-scoped numbers we do
       * have are shown instead so the grid isn't just placeholder text. */}
      <StatsGrid
        stats={[
          { emoji: "🧩", label: "Modules Enabled", value: `${enabledCount}/${data.modules.length}` },
          { emoji: "⚙️", label: "Locale", value: data.settings.locale },
          { emoji: "🔡", label: "Prefix", value: data.settings.prefix ?? "(default)" },
          { emoji: "🌐", label: "Timezone", value: (data.settings["timezone"] as string) ?? "UTC" },
        ]}
      />

      <GeneralSettingsForm guildId={guildId} settings={data.settings} />
    </div>
  );
}
