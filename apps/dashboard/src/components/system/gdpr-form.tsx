"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CircleCheck } from "lucide-react";
import { gdprDeleteUser } from "#/actions/system-actions";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardDescription,
} from "#/components/ui/card";
import { Field, Input } from "#/components/ui/input";
import { Checkbox } from "#/components/ui/switch";
import { Button } from "#/components/ui/button";
import { Alert } from "#/components/ui/alert";
import { useServerAction } from "#/lib/use-server-action";
import { SPRING_SNAPPY } from "#/lib/animate";

export function GdprForm() {
  const [userId, setUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { isPending, run } = useServerAction();
  const reduce = useReducedMotion();

  function handleDelete() {
    setResult(null);
    run(async () => {
      const res = await gdprDeleteUser(userId);
      setFailed(!res.ok);
      setResult(res.ok ? "Deleted." : (res.error ?? "Failed"));
      if (res.ok) {
        setUserId("");
        setConfirmed(false);
      }
    });
  }

  return (
    <Card className="border-danger/30">
      <CardHeader>
        <CardTitle>GDPR data deletion</CardTitle>
        <CardDescription>
          Irreversibly purges a user&apos;s data across every guild. Moderation
          case attribution is anonymised to <code className="font-mono">0</code>;
          AFK, temp-VC and similar rows are removed outright.
        </CardDescription>
      </CardHeader>

      <CardBody className="flex max-w-md flex-col gap-3">
        <Field
          label="Discord user ID"
          htmlFor="gdprUserId"
          hint="Right-click a user with Developer Mode enabled to copy their ID."
        >
          <Input
            id="gdprUserId"
            placeholder="123456789012345678"
            className="font-mono text-[14px]"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-fg-muted">
          <Checkbox checked={confirmed} onChange={setConfirmed} />
          I understand this cannot be undone.
        </label>

        <Button
          variant="danger"
          disabled={!userId || !confirmed || isPending}
          onClick={handleDelete}
          className="self-start"
        >
          {isPending ? "Deleting…" : "Delete user data"}
        </Button>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SNAPPY}
            >
              {failed ? (
                <Alert variant="danger">{result}</Alert>
              ) : (
                <Alert variant="info" icon={CircleCheck} className="text-success">
                  {result}
                </Alert>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardBody>
    </Card>
  );
}
