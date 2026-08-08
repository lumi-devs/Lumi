"use client";

import { useState } from "react";
import { setBotIdentity } from "#/actions/system-actions";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Field, Input } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { ActionError } from "#/components/action-error";
import { useServerAction } from "#/lib/use-server-action";

export function BotIdentityForm({
  inviteUrl,
  supportGuildId,
}: {
  inviteUrl: string | null;
  supportGuildId: string | null;
}) {
  const [invite, setInvite] = useState(inviteUrl ?? "");
  const [supportGuild, setSupportGuild] = useState(supportGuildId ?? "");
  const { isPending, error, setError, run } = useServerAction();

  function save() {
    run(async () => {
      const res = await setBotIdentity(invite || null, supportGuild || null);
      if (!res.ok) setError(res.error ?? "Failed");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot identity</CardTitle>
        <CardDescription>
          Lumi&apos;s own invite link and support server — bot owner only.
        </CardDescription>
      </CardHeader>
      <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invite URL" htmlFor="botInviteUrl">
          <Input
            id="botInviteUrl"
            type="url"
            placeholder="https://discord.com/oauth2/authorize?…"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
        </Field>
        <Field label="Support guild ID" htmlFor="botSupportGuildId">
          <Input
            id="botSupportGuildId"
            placeholder="123456789012345678"
            value={supportGuild}
            onChange={(e) => setSupportGuild(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button variant="secondary" disabled={isPending} onClick={save}>
            Save
          </Button>
          <ActionError error={error} />
        </div>
      </CardBody>
    </Card>
  );
}
