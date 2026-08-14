import { ClipboardList } from "lucide-react";
import { Card } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableScroll } from "#/components/ui/table";
import { formatTime, splitAction } from "#/lib/log-format";
import type { AuditEntryView } from "#/lib/dashboard-data";

const PLATFORM_TONE: Record<string, string> = {
  web: "bg-accent-soft text-accent-fg",
  discord: "bg-success-soft text-success",
};

export function RecentAuditTable({
  entries,
  memberNames,
}: {
  entries: AuditEntryView[];
  /** Discord user ID → display name, from the guild dashboard payload. */
  memberNames: Record<string, string>;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          compact
          icon={ClipboardList}
          title="Nothing recorded yet"
          description="The first line lands here as soon as someone changes a setting or acts on this server."
        />
      </Card>
    );
  }

  return (
    <Card>
      <TableScroll>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Time (UTC)</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Source</TH>
            </TR>
          </THead>
          <TBody className="divide-border-soft">
            {entries.map((entry) => {
              const { scope, verb } = splitAction(entry.action);
              return (
                <TR key={entry.id}>
                  <TD className="tabular font-mono text-[11.5px] whitespace-nowrap text-fg">
                    {formatTime(entry.createdAt)}
                  </TD>
                  <TD className="max-w-40 truncate text-[12.5px] text-fg-muted">
                    {memberNames[entry.userId] ?? (
                      <span className="font-mono text-[11.5px]">
                        {entry.userId}
                      </span>
                    )}
                  </TD>
                  <TD className="font-mono text-[11.5px]">
                    {scope ? <span className="text-fg-subtle">{scope}.</span> : null}
                    <span className="text-fg">{verb}</span>
                  </TD>
                  <TD>
                    <span
                      className={`inline-flex rounded-full px-2 py-px font-mono text-[10.5px] ${
                        PLATFORM_TONE[entry.platform] ?? "bg-bg-subtle text-fg-muted"
                      }`}
                    >
                      {entry.platform === "web" ? "dashboard" : entry.platform}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableScroll>
    </Card>
  );
}
