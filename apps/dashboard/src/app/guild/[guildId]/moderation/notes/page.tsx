import { Alert } from "#/components/ui/alert";
import { PlugZap, StickyNote } from "lucide-react";
import { requireGuild } from "#/lib/auth-guards";
import { getGuildEntities } from "#/lib/guild-reads";
import { rpc } from "#/lib/rpc";
import { exportGuildModNotes } from "#/actions/guild-export-actions";
import { GuildModNotesTable } from "#/components/guild/guild-mod-notes-table";
import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { ExportLogButton } from "#/components/ui/export-log-button";
import { FilterBar } from "#/components/ui/filter-bar";
import { PageHeader } from "#/components/ui/page-header";
import type { ModNoteView } from "@lumi/contracts/views";
import { extractMemberNames, single } from "#/lib/log-format";
import { isSnowflake } from "#/lib/moderation-cases";

export default async function ModNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);
  const query = await searchParams;
  const userId = single(query["user"]);
  const badUserFilter = Boolean(userId) && !isSnowflake(userId);

  const entitiesPromise = getGuildEntities(guildId, session.userId);
  const notesPromise =
    userId && !badUserFilter
      ? rpc("guild.modNotes.list", {
          guildId,
          actorId: session.userId,
          data: { userId },
        })
      : null;

  const entities = await entitiesPromise;
  const memberNames = extractMemberNames(entities.members);
  const memberOptions = [...entities.members]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((m) => ({ value: m.id, label: m.displayName }));

  let notes: ModNoteView[] | null = null;
  let failure: string | null = null;
  if (notesPromise) {
    try {
      notes = (await notesPromise).notes;
    } catch (err) {
      failure = err instanceof Error ? err.message : "The request failed.";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Mod Notes"
          description="Persistent staff-only notes on a member — never shown to them and never counted toward warn thresholds. Look up a member by Discord ID to read or add notes."
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <Card>
          <CardHeader
            actions={
              notes ? (
                <>
                  <Badge variant="neutral" className="tabular">
                    {notes.length} note{notes.length === 1 ? "" : "s"}
                  </Badge>
                  {notes.length > 0 ? (
                    <ExportLogButton<ModNoteView>
                      label="Download"
                      filename={`lumi-mod-notes-${guildId}-${userId}-${Date.now()}.json`}
                      action={exportGuildModNotes.bind(null, guildId, userId)}
                    />
                  ) : null}
                </>
              ) : null
            }
          >
            <CardTitle>Look up a member</CardTitle>
            <CardDescription>
              Notes are scoped to one member at a time — search their Discord
              user ID to see what staff have written about them here.
            </CardDescription>
          </CardHeader>

          <div className="border-b border-border">
            <FilterBar
              fields={[
                {
                  type: "search",
                  name: "user",
                  label: "Member user ID",
                  placeholder: "e.g. 328473289473289473",
                  inputMode: "numeric",
                  suggestions: memberOptions,
                },
              ]}
            />
            {badUserFilter ? (
              <Alert variant="warning" className="mx-4 mb-3">
                That isn&rsquo;t a Discord user ID — 15 to 20 digits, copied
                with Developer Mode on.
              </Alert>
            ) : null}
          </div>

          {!userId || badUserFilter ? (
            <EmptyState
              compact
              icon={StickyNote}
              title="Search for a member"
              description="Enter a Discord user ID above to view or add staff notes for them."
            />
          ) : failure !== null || notes === null ? (
            <EmptyState
              compact
              icon={PlugZap}
              title="Notes couldn't be loaded"
              description="Check that the bot is online and connected to the message broker, then reload this page."
              footnote={failure ?? undefined}
            />
          ) : (
            <GuildModNotesTable
              guildId={guildId}
              userId={userId}
              notes={notes}
              memberNames={memberNames}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
