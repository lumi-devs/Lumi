"use client";

import { useState } from "react";
import { gdprDeleteUser } from "#/actions/system-actions";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { Input, Label } from "#/components/ui/input";
import { Button } from "#/components/ui/button";
import { useServerAction } from "#/lib/use-server-action";

/** dashboard.md §9A `SystemUserPrivacyConsole` — GDPR deletion trigger, wired to the existing `global.gdpr.delete` RPC. */
export function GdprForm() {
  const [userId, setUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { isPending, run } = useServerAction();

  function handleDelete() {
    setResult(null);
    run(async () => {
      const res = await gdprDeleteUser(userId);
      setResult(res.ok ? "Deleted." : (res.error ?? "Failed"));
      if (res.ok) {
        setUserId("");
        setConfirmed(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>GDPR data deletion</CardTitle>
          <CardDescription>
            Irreversibly purges a user&apos;s data across every guild (moderation
            case attribution anonymized to <code>0</code>, AFK/temp-VC/etc. rows
            removed).
          </CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gdprUserId">Discord user ID</Label>
          <Input
            id="gdprUserId"
            placeholder="123456789012345678"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I understand this cannot be undone.
        </label>
        <Button
          variant="danger"
          disabled={!userId || !confirmed || isPending}
          onClick={handleDelete}
          className="self-start"
        >
          Delete user data
        </Button>
        {result && <p className="text-xs text-white/60">{result}</p>}
      </div>
    </Card>
  );
}
