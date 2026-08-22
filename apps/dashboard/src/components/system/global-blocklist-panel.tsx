"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { blockUserGlobally } from "#/actions/blocklist-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { ExportLogButton } from "#/components/ui/export-log-button";
import { Field, Input } from "#/components/ui/input";
import { globalBlocklistColumns } from "#/components/system/global-blocklist-columns";
import { Pagination } from "#/components/ui/pagination";
import type { BlocklistEntryView } from "#/lib/dashboard-data";
import { isSnowflake } from "#/lib/log-format";
import { useServerAction } from "#/lib/use-server-action";

// One row silences a user in every server Lumi is in, effective immediately —
// hence a confirmation in both directions.
export function GlobalBlocklistPanel({
  entries,
  page,
  pageSize,
  total,
  exportAction,
}: {
  entries: BlocklistEntryView[];
  page: number;
  pageSize: number;
  total: number;
  exportAction: () => Promise<{
    ok: boolean;
    error?: string;
    items?: BlocklistEntryView[];
  }>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const columns = globalBlocklistColumns({ onUnblocked: setNotice });

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {notice ? <Alert variant="info">{notice}</Alert> : null}
      </div>

      <BlockForm onBlocked={setNotice} />

      <Card>
        <CardHeader
          actions={
            <>
              <Badge variant="neutral" className="tabular">
                {total} blocked
              </Badge>
              {total > 0 ? (
                <ExportLogButton<BlocklistEntryView>
                  label="Download"
                  filename={`lumi-global-blocklist-${Date.now()}.json`}
                  action={exportAction}
                />
              ) : null}
            </>
          }
        >
          <CardTitle>Blocked everywhere</CardTitle>
          <CardDescription>
            A server owner can also block someone in their own server only.
            Those blocks are managed from that server and are not listed here.
          </CardDescription>
        </CardHeader>

        {entries.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={total > 0 ? "This page is past the end of the list" : "Nobody is blocked globally"}
            description={
              total > 0
                ? `The list holds ${total} ${total === 1 ? "person" : "people"}. Go back to the first page to see them.`
                : "A global block is the last resort — it silences someone in every server at once. Use a single server's own blocklist when the problem is limited to that server."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={entries}
            getRowId={(entry) => String(entry.id)}
          />
        )}

        {total > 0 ? (
          <CardFooter>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              itemLabel="blocked users"
            />
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}

function BlockForm({ onBlocked }: { onBlocked: (message: string) => void }) {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  const valid = isSnowflake(userId);
  const touched = userId.length > 0;

  function confirm() {
    run(async () => {
      const result = await blockUserGlobally(
        userId,
        reason.trim() || undefined,
      );
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't apply the block. Check that it is online, then try again.",
        );
        return;
      }
      onBlocked(
        `Blocked ${userId}. Lumi ignores them in every server from now on.`,
      );
      setOpen(false);
      setUserId("");
      setReason("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Block a user everywhere</CardTitle>
        <CardDescription>
          Blocked users get no response from any Lumi command, in any server.
          They are not banned or removed from anywhere — Lumi simply stops
          answering them.
        </CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,18rem)_1fr_auto]">
          <Field
            label="User ID"
            htmlFor="block-user"
            hint="15 to 20 digits, copied with Developer Mode on."
          >
            <Input
              id="block-user"
              inputMode="numeric"
              className="tabular font-mono text-[14px]"
              placeholder="e.g. 328473289473289473"
              value={userId}
              onChange={(e) => {
                setError(null);
                setUserId(e.target.value.trim());
              }}
            />
          </Field>
          <Field
            label="Reason"
            htmlFor="block-reason"
            hint="Kept on the row so whoever reads this list next knows why."
          >
            <Input
              id="block-reason"
              placeholder="e.g. Mass DM spam across 12 servers"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button
            variant="primary"
            disabled={!valid || isPending}
            className="self-start sm:mt-[26px]"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            Block globally
          </Button>
        </div>

        {touched && !valid ? (
          <Alert variant="warning">
            That isn&rsquo;t a Discord user ID. Right-click the user with
            Developer Mode on and choose Copy User ID — it is 15 to 20 digits,
            never a username.
          </Alert>
        ) : null}

        {open ? null : <ActionError error={error} />}
      </CardBody>

      <ConfirmDialog
        open={open}
        title={`Block ${userId} everywhere?`}
        description={
          <>
            Every Lumi command stops responding to this user in every server,
            immediately. They keep their membership, roles and messages — this
            only cuts them off from the bot. You can lift it from this screen at
            any time.
            {reason.trim() ? null : (
              <> No reason is recorded, so the row will not say why.</>
            )}
          </>
        }
        confirmLabel="Block globally"
        pendingLabel="Blocking…"
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          if (isPending) return;
          setOpen(false);
          setError(null);
        }}
      />
    </Card>
  );
}
