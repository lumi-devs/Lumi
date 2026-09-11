"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfigField } from "@lumi/contracts";
import { Check, Search } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useServerAction } from "#/lib/use-server-action";
import type { DashboardChannelView } from "#/lib/dashboard-data";

// Matches the Discord panel fallback (`resolveChannelTypes` in
// `packages/core/src/modules/core/ui/modules.ts`): text channels unless the
// field declares `channelTypes`, which always wins.
const DefaultPickableChannelTypes = new Set([0]);

export function channelOptionsFor(
  field: ConfigField,
  channels: DashboardChannelView[],
): DashboardChannelView[] {
  const allow = field.channelTypes;
  return channels.filter((c) =>
    allow && allow.length > 0
      ? allow.includes(c.type)
      : DefaultPickableChannelTypes.has(c.type),
  );
}

const ClaimPollIntervalMs = 3_000;

/**
 * One self-contained "Set channel" flow for any Channel-typed field: a
 * compact trigger opens a popup with a searchable channel list and, when the
 * field declares `claimable`, a fallback that issues a claim code and
 * auto-detects the channel it was posted in — mirroring Sapphire's dashboard
 * so an admin never has to leave this popup to finish claiming a channel.
 */
export function ChannelPicker({
  field,
  value,
  onChange,
  channels,
  guildId,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
  channels: DashboardChannelView[];
  guildId?: string;
}) {
  const shown = typeof value === "string" ? value : "";
  const options = channelOptionsFor(field, channels);
  const current = options.find((c) => c.id === shown);
  const missing = shown !== "" && !current;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"browse" | "claim">("browse");
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [code, setCode] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal — fall back to the plain `open` attribute so
    // component tests can still query the dialog.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  function close() {
    setOpen(false);
    setStep("browse");
    setQuery("");
    setCode(null);
    setIssuedAt(null);
    setCopied(false);
    setError(null);
  }

  function pick(id: string | null) {
    onChange(id);
    close();
  }

  function requestCode() {
    if (!guildId) return;
    setStep("claim");
    run(async () => {
      const { issueLogClaim } = await import("#/actions/log-claims-actions");
      const result = await issueLogClaim(guildId);
      if (!result.ok || !result.code) {
        setError(result.error ?? "Issuing the claim code failed. Try again.");
        return;
      }
      setCode(result.code);
      setIssuedAt(new Date().toISOString());
    });
  }

  // Auto-detect: poll for the channel the code was posted in and fill it
  // straight into the field, same as picking it from the list — the admin
  // still hits the normal Save bar, there's no separate "pending claims" list
  // to go find it on.
  useEffect(() => {
    if (!code || !issuedAt || !guildId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const { pollChannelClaim } = await import("#/actions/log-claims-actions");
        const result = await pollChannelClaim(guildId, issuedAt);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? "Checking for the claim failed.");
        } else if (result.channelId) {
          pick(result.channelId);
        }
      })();
    }, ClaimPollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, issuedAt, guildId]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("Copy failed — select the code manually.");
    }
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter((c) => c.name.toLowerCase().includes(needle))
    : options;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {missing ? (
        <p className="text-[13px] leading-4 text-warning-fg">
          This channel no longer exists.
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        aria-label={field.label}
        id={field.key}
        onClick={() => setOpen(true)}
      >
        {current ? `#${current.name}` : missing ? shown : "Set channel"}
      </Button>

      <dialog
        ref={dialogRef}
        aria-label={`${field.label} channel picker`}
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-panel border border-border bg-surface p-0 text-fg shadow-e3 backdrop:bg-overlay"
      >
        {/* Mounted only while open: a closed dialog still sits in the DOM
          and would double every label/query it contains. */}
        {open && step === "browse" ? (
          <div className="flex flex-col gap-3 p-4">
            <h2 className="font-display text-[15px] font-semibold">{field.label}</h2>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                autoFocus
                type="search"
                placeholder="Search channels…"
                aria-label="Search channels"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto" role="listbox">
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[14px] text-fg-muted transition-colors hover:bg-bg-subtle"
                  onClick={() => pick(null)}
                >
                  None
                </button>
              </li>
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === shown}
                    className="flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-bg-subtle"
                    onClick={() => pick(c.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">#{c.name}</span>
                    {c.id === shown ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-[13px] text-fg-subtle">
                  No channels match.
                </li>
              ) : null}
            </ul>
            {field.claimable && guildId ? (
              <div className="border-t border-border pt-3 text-center">
                <Button type="button" variant="ghost" size="sm" onClick={requestCode}>
                  Channel not found? Use other channel
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {open && step === "claim" ? (
          <div className="flex flex-col gap-3 p-4">
            <h2 className="font-display text-[15px] font-semibold">{field.label}</h2>
            <p className="text-[13px] leading-5 text-fg-muted">
              Send this message into the channel you want to use:
            </p>
            {code ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-bg-subtle p-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[14px]">{code}</code>
                <Button type="button" variant="secondary" size="sm" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-fg-subtle">{isPending ? "Issuing…" : "—"}</p>
            )}
            {code ? (
              <div className="flex items-center justify-center gap-2 py-2 text-[13px] text-fg-muted">
                <span
                  aria-hidden
                  className="size-3.5 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent"
                />
                Waiting for you to send the message…
              </div>
            ) : null}
            {error ? <p className="text-[13px] leading-4 text-danger">{error}</p> : null}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep("browse")}>
                Back
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
