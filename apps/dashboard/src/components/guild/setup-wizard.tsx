"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import type { ConfigField } from "@lumi/contracts";
import { setManyGuildConfigFields } from "#/actions/guild-actions";
import { ActionError } from "#/components/action-error";
import { ConfigFieldInput } from "#/components/guild/config-field-input";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { SettingRow } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import { cn } from "#/lib/utils";
import type {
  DashboardChannelView,
  DashboardRoleView,
} from "#/lib/dashboard-data";

interface StepGroup {
  moduleName: string;
  keys: string[];
}

interface StepDef {
  id: string;
  title: string;
  description: string;
  groups: StepGroup[];
}

const SecurityModuleName = "security";
const ModModuleName = "mod";

const Steps: StepDef[] = [
  {
    id: "welcome",
    title: "Welcome",
    description:
      "Three short configuration stops, then a review. Each stop saves on its own, so leaving halfway never loses progress.",
    groups: [],
  },
  {
    id: "logChannels",
    title: "Log channels",
    description:
      "Where alerts and moderation case embeds are posted, plus the quarantine role used by automatic responses.",
    groups: [
      { moduleName: SecurityModuleName, keys: ["log_channel_id"] },
      {
        moduleName: ModModuleName,
        keys: ["log_channel_id", "quarantine_role_id"],
      },
    ],
  },
  {
    id: "verification",
    title: "Verification",
    description:
      "Require members to verify before participating, and pick the role they earn for passing.",
    groups: [
      {
        moduleName: SecurityModuleName,
        keys: [
          "verification_enabled",
          "verified_role_id",
          "verification_mode",
          "verification_target",
        ],
      },
    ],
  },
  {
    id: "joinGate",
    title: "Join gate",
    description:
      "Screen new joins for raids and throwaway accounts before they can cause damage.",
    groups: [
      {
        moduleName: SecurityModuleName,
        keys: [
          "joingate_enabled",
          "min_account_age_hours",
          "raid_join_count",
          "raid_action",
        ],
      },
    ],
  },
  {
    id: "review",
    title: "Review & finish",
    description:
      "Confirm each stop below, jump back to edit anything, then head back to the overview.",
    groups: [],
  },
];

const ReviewStepIds = ["logChannels", "verification", "joinGate"];

function logChannelsComplete(
  security: Record<string, unknown>,
  mod: Record<string, unknown>,
): boolean {
  return (
    Boolean(security["log_channel_id"]) &&
    Boolean(mod["log_channel_id"]) &&
    Boolean(mod["quarantine_role_id"])
  );
}

function verificationComplete(security: Record<string, unknown>): boolean {
  return (
    security["verification_enabled"] === true &&
    Boolean(security["verified_role_id"])
  );
}

function joinGateComplete(security: Record<string, unknown>): boolean {
  return security["joingate_enabled"] === true;
}

function stepComplete(
  id: string,
  security: Record<string, unknown>,
  mod: Record<string, unknown>,
): boolean {
  switch (id) {
    case "logChannels":
      return logChannelsComplete(security, mod);
    case "verification":
      return verificationComplete(security);
    case "joinGate":
      return joinGateComplete(security);
    default:
      return false;
  }
}

export function SetupWizard({
  guildId,
  securityFields,
  securityConfig,
  modFields,
  modConfig,
  roles = [],
  channels = [],
}: {
  guildId: string;
  securityFields: ConfigField[];
  securityConfig: Record<string, unknown>;
  modFields: ConfigField[];
  modConfig: Record<string, unknown>;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
}) {
  const schemas = useMemo<Record<string, ConfigField[]>>(
    () => ({ [SecurityModuleName]: securityFields, [ModModuleName]: modFields }),
    [securityFields, modFields],
  );
  const [step, setStep] = useState(0);
  const [securityForm, setSecurityForm] =
    useState<Record<string, unknown>>(securityConfig);
  const [modForm, setModForm] = useState<Record<string, unknown>>(modConfig);
  const [securityCommitted, setSecurityCommitted] =
    useState<Record<string, unknown>>(securityConfig);
  const [modCommitted, setModCommitted] =
    useState<Record<string, unknown>>(modConfig);
  const [doneIds, setDoneIds] = useState<Set<string>>(
    () =>
      new Set(
        ReviewStepIds.filter((id) =>
          stepComplete(id, securityConfig, modConfig),
        ),
      ),
  );
  const { isPending, error, setError, run } = useServerAction();

  const def = Steps[step]!;
  const hasSchema = securityFields.length > 0 || modFields.length > 0;

  function fieldFor(moduleName: string, key: string): ConfigField | undefined {
    return schemas[moduleName]?.find((f) => f.key === key);
  }

  function goTo(next: number) {
    setError(null);
    setStep(Math.max(0, Math.min(next, Steps.length - 1)));
  }

  function markDone(id: string) {
    setDoneIds((prev) => new Set(prev).add(id));
  }

  function handleContinue() {
    if (def.groups.length === 0) {
      markDone(def.id);
      goTo(step + 1);
      return;
    }
    run(async () => {
      for (const group of def.groups) {
        const form = group.moduleName === SecurityModuleName ? securityForm : modForm;
        const committed =
          group.moduleName === SecurityModuleName ? securityCommitted : modCommitted;
        const changed: Record<string, unknown> = {};
        for (const key of group.keys) {
          if (!fieldFor(group.moduleName, key)) continue;
          if (JSON.stringify(form[key]) !== JSON.stringify(committed[key])) {
            changed[key] = form[key];
          }
        }
        if (Object.keys(changed).length === 0) continue;
        const res = await setManyGuildConfigFields(
          guildId,
          group.moduleName,
          changed,
        );
        if (!res.ok) {
          setError(res.error ?? "Save failed");
          return;
        }
        if (group.moduleName === SecurityModuleName) {
          setSecurityCommitted((prev) => ({ ...prev, ...changed }));
        } else {
          setModCommitted((prev) => ({ ...prev, ...changed }));
        }
      }
      markDone(def.id);
      goTo(step + 1);
    });
  }

  function setFormValue(moduleName: string, key: string, value: unknown) {
    if (moduleName === SecurityModuleName) {
      setSecurityForm((prev) => ({ ...prev, [key]: value }));
    } else {
      setModForm((prev) => ({ ...prev, [key]: value }));
    }
  }

  function formFor(moduleName: string): Record<string, unknown> {
    return moduleName === SecurityModuleName ? securityForm : modForm;
  }

  if (!hasSchema) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Guided setup is unavailable</CardTitle>
          <CardDescription>
            The security and moderation modules did not report any settings
            for this server.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="secondary">
            <Link href={`/guild/${guildId}/config/modules`}>
              Open module settings
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const resolvableGroups = def.groups
    .map((group) => ({
      ...group,
      fields: group.keys.flatMap((key) => {
        const field = fieldFor(group.moduleName, key);
        if (!field) return [];
        return [
          {
            field: { ...field, key: `${group.moduleName}.${field.key}` },
            moduleName: group.moduleName,
            configKey: field.key,
          },
        ];
      }),
    }))
    .filter((group) => group.fields.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Setup progress</CardTitle>
          <CardDescription>
            {doneIds.size} of {Steps.length} stops complete.
          </CardDescription>
        </CardHeader>
        <CardBody className="p-0">
          <ol className="divide-y divide-border">
            {Steps.map((s, index) => {
              const done = doneIds.has(s.id);
              const current = index === step;
              return (
                <li
                  key={s.id}
                  aria-current={current ? "step" : undefined}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                      done
                        ? "bg-success-soft text-success"
                        : current
                          ? "bg-accent-soft text-accent-fg"
                          : "bg-bg-subtle text-fg-subtle",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[14.5px]",
                      current ? "font-semibold text-fg" : "text-fg-muted",
                    )}
                  >
                    {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Step {step + 1} of {Steps.length}: {def.title}
          </CardTitle>
          <CardDescription>{def.description}</CardDescription>
        </CardHeader>

        {def.id === "welcome" ? (
          <CardBody>
            <ul className="flex flex-col gap-2 text-[14.5px] text-fg-muted">
              {ReviewStepIds.map((id) => {
                const s = Steps.find((candidate) => candidate.id === id)!;
                return (
                  <li key={id} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        doneIds.has(id) ? "bg-success" : "bg-border-strong",
                      )}
                    />
                    <span>
                      <span className="font-medium text-fg">{s.title}</span>
                      {doneIds.has(id) ? " — already configured" : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        ) : def.id === "review" ? (
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {ReviewStepIds.map((id) => {
                const s = Steps.find((candidate) => candidate.id === id)!;
                const complete = stepComplete(id, securityForm, modForm);
                const index = Steps.findIndex((candidate) => candidate.id === id);
                return (
                  <li key={id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full",
                        complete
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning-fg",
                      )}
                    >
                      {complete ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <TriangleAlert className="size-3.5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-fg">{s.title}</p>
                      <p className="text-[14px] text-fg-muted">
                        {complete ? "Configured." : "Needs attention."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => goTo(index)}
                    >
                      Edit
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        ) : resolvableGroups.length === 0 ? (
          <CardBody>
            <p className="text-[14.5px] text-fg-muted">
              These settings are not available on this server right now.
              Continue to the next stop.
            </p>
          </CardBody>
        ) : (
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {resolvableGroups.flatMap((group) =>
                group.fields.map(({ field, moduleName, configKey }) => (
                  <SettingRow
                    key={`${moduleName}.${configKey}`}
                    htmlFor={field.key}
                    label={field.label}
                    description={field.description}
                    control={
                      <ConfigFieldInput
                        field={field}
                        value={formFor(moduleName)[configKey]}
                        onChange={(value) =>
                          setFormValue(moduleName, configKey, value)
                        }
                        roles={roles}
                        channels={channels}
                      />
                    }
                  />
                )),
              )}
            </div>
          </CardBody>
        )}

        {error ? (
          <CardBody>
            <ActionError error={error} className="w-full" />
          </CardBody>
        ) : null}

        <CardFooter className="justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || isPending}
            onClick={() => goTo(step - 1)}
          >
            Back
          </Button>
          {def.id === "review" ? (
            <Button asChild variant="primary">
              <Link href={`/guild/${guildId}`}>Back to overview</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={handleContinue}
            >
              {isPending
                ? "Saving…"
                : def.id === "welcome"
                  ? "Get started"
                  : "Save & continue"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
