"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";
import { ActionError } from "#/components/action-error";
import { cn } from "#/lib/utils";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  pendingLabel,
  tone = "danger",
  pending = false,
  error = null,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        if (pending) e.preventDefault();
      }}
      onClose={onClose}
      onClick={(e) => {
        if (!pending && e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-3rem)]",
        "overflow-y-auto rounded-panel border border-border",
        "bg-surface p-0 text-fg shadow-e3 backdrop:bg-overlay",
      )}
    >
      <div className="flex flex-col gap-2 px-4 py-4">
        <h2
          id={titleId}
          className="font-display text-[17px] leading-5 font-semibold tracking-[0.01em] text-fg"
        >
          {title}
        </h2>
        <div id={descriptionId} className="text-[15px] leading-5 text-fg-muted">
          {description}
        </div>
        {children}
        <ActionError error={error} className="mt-1" />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={pending}
          autoFocus
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
