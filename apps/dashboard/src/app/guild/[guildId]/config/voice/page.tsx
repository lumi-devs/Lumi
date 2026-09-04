import { Mic, PlugZap } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import {
  getGuildDashboard,
  getGuildTempVcGenerators,
  getGuildTempVcRecords,
} from "#/lib/dashboard-fetch";
import { TempVcGenerators } from "#/components/guild/tempvc-generators";
import { TempVcLiveChannels } from "#/components/guild/tempvc-live-channels";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { PageHeader } from "#/components/ui/page-header";
import { isVoiceChannel } from "#/lib/channel-types";
import type {
  TempVcGeneratorView,
  TempVcRecordView,
} from "#/lib/dashboard-data";

export default async function TempVcPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  const dashboard = await getGuildDashboard(guildId, session.userId);
  const voiceChannels = dashboard.channels.filter((c) => isVoiceChannel(c.type));
  const channelNames = Object.fromEntries(
    dashboard.channels.map((c) => [c.id, c.name]),
  );

  let generators: TempVcGeneratorView[] | null = null;
  let generatorFailure: string | null = null;
  try {
    generators = await getGuildTempVcGenerators(guildId, session.userId);
  } catch (err) {
    generatorFailure = err instanceof Error ? err.message : "The request failed.";
  }

  let records: TempVcRecordView[] | null = null;
  let recordFailure: string | null = null;
  try {
    records = await getGuildTempVcRecords(guildId, session.userId);
  } catch (err) {
    recordFailure = err instanceof Error ? err.message : "The request failed.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          icon={Mic}
          title="Temporary voice channels"
          description="Members who join a generator get a voice channel of their own, created in the same category and deleted once it empties."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              generators ? (
                <Badge variant="neutral" className="tabular">
                  {generators.length} generator
                  {generators.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          >
            <CardTitle>Generators</CardTitle>
            <CardDescription>
              A generator is an ordinary voice channel nobody stays in. Joining
              it is the trigger — Lumi makes the new channel, moves the member
              across, and hands them ownership of it.
            </CardDescription>
          </CardHeader>

          {generatorFailure !== null || generators === null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Generators couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={generatorFailure ?? undefined}
            />
          ) : (
            <TempVcGenerators
              guildId={guildId}
              generators={generators}
              channels={voiceChannels}
            />
          )}
        </Card>
      </div>

      <div className="rise" style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              records ? (
                <Badge variant={records.length > 0 ? "success" : "neutral"} dot>
                  {records.length} live
                </Badge>
              ) : null
            }
          >
            <CardTitle>Live channels</CardTitle>
            <CardDescription>
              Owners lock, hide and rename their own channel from its panel in
              Discord. This is a read-only view of what those settings are right
              now.
            </CardDescription>
          </CardHeader>

          {recordFailure !== null || records === null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Live channels couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={recordFailure ?? undefined}
            />
          ) : (
            <>
              <TempVcLiveChannels
                records={records}
                generators={generators ?? []}
                members={dashboard.members}
                channelNames={channelNames}
                now={Date.now()}
              />
              {records.length > 0 ? (
                <CardFooter>
                  A snapshot from when this page loaded — reload to see what
                  changed.
                </CardFooter>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
