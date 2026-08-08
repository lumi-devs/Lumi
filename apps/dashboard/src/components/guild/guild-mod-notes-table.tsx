"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { addModNote, removeModNote } from "#/actions/mod-notes-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Textarea } from "#/components/ui/input";
import { guildModNotesColumns } from "#/components/guild/guild-mod-notes-columns";
import type { ModNoteView } from "#/lib/dashboard-data";
import { useServerAction } from "#/lib/use-server-action";

export function GuildModNotesTable({
  guildId,
  userId,
  notes,
  memberNames,
}: {
  guildId: string;
  userId: string;
  notes: ModNoteView[];
  memberNames: Record<string, string>;
}) {
  const [target, setTarget] = useState<ModNoteView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const columns = guildModNotesColumns({
    memberNames,
    onRemove: (note) => {
      setError(null);
      setNotice(null);
      setTarget(note);
    },
  });

  function confirmRemove() {
    if (!target) return;
    const { id } = target;
    run(async () => {
      const result = await removeModNote(guildId, id);
      if (!result.ok) {
        setError(result.error ?? "Removing the note failed. Try again in a moment.");
        return;
      }
      setNotice("Note removed.");
      setTarget(null);
    });
  }

  return (
    <>
      <div aria-live="polite">
        {notice ? (
          <Alert variant="info" className="mx-4 mt-3">
            {notice}
          </Alert>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes for this member"
          description="Add the first staff-only note below. It's never shown to the member and doesn't count toward warn thresholds."
        />
      ) : (
        <DataTable columns={columns} data={notes} getRowId={(note) => String(note.id)} />
      )}

      <NoteForm
        guildId={guildId}
        userId={userId}
        onAdded={(message) => {
          setNotice(message);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title="Remove this note?"
        description="This note is gone for good once removed — nothing in the member's history references it."
        confirmLabel="Remove note"
        pendingLabel="Removing…"
        pending={isPending}
        error={error}
        onConfirm={confirmRemove}
        onClose={() => {
          if (isPending) return;
          setTarget(null);
          setError(null);
        }}
      />
    </>
  );
}

function NoteForm({
  guildId,
  userId,
  onAdded,
}: {
  guildId: string;
  userId: string;
  onAdded: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Write something before adding the note.");
      return;
    }
    run(async () => {
      const result = await addModNote(guildId, userId, trimmed);
      if (!result.ok) {
        setError(result.error ?? "Adding the note failed. Try again in a moment.");
        return;
      }
      onAdded("Note added.");
      setMessage("");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-3"
    >
      <Field
        label="New note"
        htmlFor="note-message"
        className="gap-1"
        hint="Visible only to staff with access to this dashboard"
      >
        <Textarea
          id="note-message"
          value={message}
          maxLength={1000}
          rows={3}
          placeholder="e.g. Warned verbally in #general about spamming links, no formal warn issued."
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Adding…" : "Add note"}
        </Button>
      </div>
      <ActionError error={error} />
    </form>
  );
}
