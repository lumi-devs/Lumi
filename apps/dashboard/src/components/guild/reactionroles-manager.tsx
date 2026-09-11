"use client";

import { useState } from "react";
import { Ticket } from "lucide-react";
import {
  deleteReactionRoleMenu,
  setReactionRoleMenu,
} from "#/actions/reactionroles-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Input, Textarea } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
  modeLabel,
  reactionrolesColumns,
} from "#/components/guild/reactionroles-columns";
import { DiscordMessagePreview } from "#/components/guild/discord-message-preview";
import { buildMenuPreview } from "#/lib/reactionroles-preview";
import { MessageBuilderV2 } from "#/components/guild/message-builder-v2";
import type {
  DashboardRoleView,
  ReactionRoleMenuModeView,
  ReactionRoleMenuView,
  ReactionRoleOptionView,
} from "#/lib/dashboard-data";
import type { MessageDocumentV2, ReactionRoleMenuSetPayload } from "@lumi/contracts";
import { useServerAction } from "#/lib/use-server-action";

const HexColorPattern = /^#[0-9a-fA-F]{6}$/;

function maxOptionsForMode(mode: ReactionRoleMenuModeView): number {
  if (mode === "select") return 25;
  return 20;
}

interface OptionDraft {
  key: number;
  id?: string;
  label: string;
  emoji: string;
  description: string;
  roleId: string;
  requiredRoleId: string;
}

let draftKey = 1;
function toDraft(option: ReactionRoleOptionView): OptionDraft {
  return {
    key: draftKey++,
    id: option.id,
    label: option.label,
    emoji: option.emoji ?? "",
    description: option.description ?? "",
    roleId: option.roleId,
    requiredRoleId: option.requiredRoleId ?? "",
  };
}

function blankDraft(): OptionDraft {
  return {
    key: draftKey++,
    label: "",
    emoji: "",
    description: "",
    roleId: "",
    requiredRoleId: "",
  };
}

export function ReactionRolesManager({
  guildId,
  menus,
  roles,
}: {
  guildId: string;
  menus: ReactionRoleMenuView[];
  roles: DashboardRoleView[];
}) {
  const [editing, setEditing] = useState<ReactionRoleMenuView | "new" | null>(null);
  const [target, setTarget] = useState<ReactionRoleMenuView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const columns = reactionrolesColumns({
    onEdit: (menu) => {
      setError(null);
      setNotice(null);
      setEditing(menu);
    },
    onRemove: (menu) => {
      setError(null);
      setNotice(null);
      setTarget(menu);
    },
  });

  function confirmRemove() {
    if (!target) return;
    const { id, title } = target;
    run(async () => {
      const result = await deleteReactionRoleMenu(guildId, id);
      if (!result.ok) {
        setError(result.error ?? "Removing the menu failed. Try again.");
        return;
      }
      setNotice(`Menu “${title}” removed. Already-posted copies stay until reposted.`);
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

      {menus.length === 0 && editing === null ? (
        <EmptyState
          icon={Ticket}
          title="No role menus yet"
          description="Create the first menu below. Members claim roles from it with buttons, a dropdown, or message reactions — post it in Discord with /reactionroles menu post."
        />
      ) : (
        <DataTable
          columns={columns}
          data={menus}
          getRowId={(menu) => menu.id}
        />
      )}

      <MenuForm
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        guildId={guildId}
        roles={roles}
        editing={editing === "new" ? null : editing}
        creating={editing === "new"}
        open={editing !== null}
        onOpenNew={() => {
          setError(null);
          setNotice(null);
          setEditing("new");
        }}
        onCancel={() => setEditing(null)}
        onSaved={(message) => {
          setNotice(message);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title="Remove this menu?"
        description="The menu definition is deleted. Members keep roles they already claimed; posted copies stop updating."
        confirmLabel="Remove menu"
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

function roleName(roles: DashboardRoleView[], id: string): string {
  return roles.find((r) => r.id === id)?.name ?? id;
}

function MenuForm({
  guildId,
  roles,
  editing,
  creating,
  open,
  onOpenNew,
  onSaved,
  onCancel,
}: {
  guildId: string;
  roles: DashboardRoleView[];
  editing: ReactionRoleMenuView | null;
  creating: boolean;
  open: boolean;
  onOpenNew: () => void;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [color, setColor] = useState(editing?.color ?? "");
  const [mode, setMode] = useState<ReactionRoleMenuModeView>(editing?.mode ?? "buttons");
  const [exclusive, setExclusive] = useState(editing?.exclusive ?? false);
  const [maxRoles, setMaxRoles] = useState(String(editing?.maxRoles ?? 1));
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    editing ? editing.options.map(toDraft) : [blankDraft()],
  );
  const [richContent, setRichContent] = useState<MessageDocumentV2>(
    editing?.richContent ?? { blocks: [] },
  );
  const { isPending, error, setError, run } = useServerAction();

  if (!open) {
    return (
      <div className="border-t border-border bg-bg-subtle px-4 py-3">
        <Button type="button" variant="primary" onClick={onOpenNew}>
          New menu
        </Button>
      </div>
    );
  }

  function patchOption(key: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  const preview = buildMenuPreview({
    title,
    description,
    color,
    mode,
    options: options.map((o) => ({
      label: o.label,
      emoji: o.emoji,
      role: o.roleId ? roleName(roles, o.roleId) : "",
    })),
    richContent,
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0 || trimmedTitle.length > 100) {
      setError("The title has to be between 1 and 100 characters.");
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 1000) {
      setError("The description has to be at most 1000 characters.");
      return;
    }
    const trimmedColor = color.trim();
    if (trimmedColor.length > 0 && !HexColorPattern.test(trimmedColor)) {
      setError("Color must be a hex value like #5865F2, or left empty.");
      return;
    }
    const parsedMax = Number.parseInt(maxRoles, 10);
    if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 25) {
      setError("Max roles has to be a whole number from 1 to 25.");
      return;
    }
    const cap = maxOptionsForMode(mode);
    const filled = options.filter(
      (o) => o.label.trim().length > 0 || o.roleId.length > 0,
    );
    if (filled.length === 0) {
      setError("Add at least one option with a label and a role.");
      return;
    }
    if (filled.length > cap) {
      setError(`${modeLabel(mode)} menus hold at most ${cap} options.`);
      return;
    }
    const seenRoles = new Set<string>();
    for (const option of filled) {
      const label = option.label.trim();
      if (label.length === 0 || label.length > 80) {
        setError("Every option needs a label between 1 and 80 characters.");
        return;
      }
      if (option.emoji.trim().length > 100) {
        setError("Emoji text has to be at most 100 characters.");
        return;
      }
      if (option.description.trim().length > 100) {
        setError("Option descriptions have to be at most 100 characters.");
        return;
      }
      if (!option.roleId) {
        setError(`Pick the granted role for “${label}”.`);
        return;
      }
      if (seenRoles.has(option.roleId)) {
        setError(`“${roleName(roles, option.roleId)}” is used twice — each role gets one option.`);
        return;
      }
      seenRoles.add(option.roleId);
      if (option.requiredRoleId && option.requiredRoleId === option.roleId) {
        setError(`“${label}” cannot require the role it grants.`);
        return;
      }
    }

    const payload: ReactionRoleMenuSetPayload = {
      id: editing?.id ?? trimmedTitle,
      title: trimmedTitle,
      description: trimmedDescription || null,
      color: trimmedColor || null,
      mode,
      exclusive,
      maxRoles: exclusive ? 1 : parsedMax,
      options: filled.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        label: o.label.trim(),
        emoji: o.emoji.trim() || null,
        description: o.description.trim() || null,
        roleId: o.roleId,
        requiredRoleId: o.requiredRoleId || null,
      })),
      richContent,
    };
    run(async () => {
      const result = await setReactionRoleMenu(guildId, payload);
      if (!result.ok) {
        setError(result.error ?? "Saving the menu failed. Try again.");
        return;
      }
      onSaved(creating ? "Menu created. Post it in Discord to make it live." : "Menu updated. Repost it in Discord to refresh posted copies.");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 border-t border-border bg-bg-subtle px-4 py-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title" htmlFor="rr-menu-title" className="gap-1">
          <Input
            id="rr-menu-title"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Game night roles"
          />
        </Field>
        <Field label="Accent color" htmlFor="rr-menu-color" className="gap-1">
          <Input
            id="rr-menu-color"
            value={color}
            maxLength={7}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#5865F2"
            spellCheck={false}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="rr-menu-description" className="gap-1">
        <Textarea
          id="rr-menu-description"
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Pick the squads you play with — change them anytime."
        ></Textarea>
      </Field>

      <Field
        label="Advanced Layout"
        htmlFor="rr-menu-rich-content"
        className="gap-1"
        hint="Optional block-based layout replacing the title and description above. The options list and the button/dropdown controls below always stay attached."
      >
        <MessageBuilderV2
          value={richContent}
          onChange={(value) => setRichContent(value as MessageDocumentV2)}
          fieldLabel="Advanced Layout"
          showPreview={false}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Mode" htmlFor="rr-menu-mode" className="w-44 gap-1">
          <Select
            id="rr-menu-mode"
            aria-label="Mode"
            value={mode}
            onValueChange={(next) => setMode(next as ReactionRoleMenuModeView)}
            options={[
              { value: "buttons", label: "Buttons" },
              { value: "select", label: "Dropdown" },
              { value: "reactions", label: "Reactions" },
            ]}
          />
        </Field>
        <Field label="Max roles" htmlFor="rr-menu-max" className="w-28 gap-1">
          <Input
            id="rr-menu-max"
            value={maxRoles}
            inputMode="numeric"
            disabled={exclusive}
            onChange={(e) => setMaxRoles(e.target.value)}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[14px] text-fg">
          <Switch checked={exclusive} onChange={setExclusive} />
          Exclusive — one role per member
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-medium text-fg">
            Options
            <Badge variant="neutral" className="ml-2 tabular">
              {options.length}/{maxOptionsForMode(mode)}
            </Badge>
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={options.length >= maxOptionsForMode(mode)}
            onClick={() => setOptions((prev) => [...prev, blankDraft()])}
          >
            Add option
          </Button>
        </div>
        {options.map((option, index) => (
          <div
            key={option.key}
            className="grid gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-[1fr_1fr]"
          >
            <Field label={`Option ${index + 1} label`} htmlFor={`rr-opt-label-${option.key}`} className="gap-1">
              <Input
                id={`rr-opt-label-${option.key}`}
                value={option.label}
                maxLength={80}
                onChange={(e) => patchOption(option.key, { label: e.target.value })}
                placeholder="Valorant"
              />
            </Field>
            <Field label="Emoji" htmlFor={`rr-opt-emoji-${option.key}`} className="gap-1">
              <Input
                id={`rr-opt-emoji-${option.key}`}
                value={option.emoji}
                maxLength={100}
                onChange={(e) => patchOption(option.key, { emoji: e.target.value })}
                placeholder="🔫"
                spellCheck={false}
              />
            </Field>
            <Field label="Granted role" htmlFor={`rr-opt-role-${option.key}`} className="gap-1">
              <Select
                id={`rr-opt-role-${option.key}`}
                aria-label="Granted role"
                value={option.roleId}
                onValueChange={(next) => patchOption(option.key, { roleId: next })}
                options={[
                  { value: "", label: "Pick a role…" },
                  ...roles.map((role) => ({ value: role.id, label: role.name })),
                ]}
              />
            </Field>
            <Field label="Required role (optional)" htmlFor={`rr-opt-req-${option.key}`} className="gap-1">
              <Select
                id={`rr-opt-req-${option.key}`}
                aria-label="Required role (optional)"
                value={option.requiredRoleId}
                onValueChange={(next) =>
                  patchOption(option.key, { requiredRoleId: next })
                }
                options={[
                  { value: "", label: "None" },
                  ...roles.map((role) => ({ value: role.id, label: role.name })),
                ]}
              />
            </Field>
            <Field label="Description (optional)" htmlFor={`rr-opt-desc-${option.key}`} className="gap-1 md:col-span-2">
              <Input
                id={`rr-opt-desc-${option.key}`}
                value={option.description}
                maxLength={100}
                onChange={(e) => patchOption(option.key, { description: e.target.value })}
                placeholder="Tactical shooter squad"
              />
            </Field>
            <div className="md:col-span-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOptions((prev) => prev.filter((o) => o.key !== option.key))}
              >
                Remove option
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium text-fg">
          Preview
          <span className="ml-2 text-[13px] font-normal text-fg-subtle">
            The card members see, from the draft above — nothing is saved yet.
          </span>
        </span>
        <DiscordMessagePreview
          channelName="role-menu"
          channelTopic="Claim your roles"
          container={preview.container}
          selectPlaceholder={preview.selectPlaceholder}
          buttons={preview.buttons}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : creating ? "Create menu" : "Save menu"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <ActionError error={error} />
    </form>
  );
}
