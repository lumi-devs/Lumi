"use client";

import { useState } from "react";
import {
  assignPermit as assignPermitAction,
  createPermit as createPermitAction,
  deletePermit as deletePermitAction,
  unassignPermit as unassignPermitAction,
  updatePermit as updatePermitAction,
} from "#/actions/guild-actions";
import { ActionError } from "#/components/action-error";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input, Label, Select } from "#/components/ui/input";
import type {
  DashboardMemberView,
  DashboardRoleView,
  PermitAssignmentView,
  PermitView,
} from "#/lib/dashboard-data";
import { KNOWN_PERMIT_NODE_GROUPS } from "#/lib/permit-nodes";
import { useServerAction } from "#/lib/use-server-action";

export function PermitsBoard({
  guildId,
  initialPermits,
  roles,
  members,
}: {
  guildId: string;
  initialPermits: PermitView[];
  roles: DashboardRoleView[];
  members: DashboardMemberView[];
}) {
  const [permits, setPermits] = useState(initialPermits);

  const enforced = permits.filter((p) => p.kind === "enforced");
  const custom = permits.filter((p) => p.kind === "custom");

  function upsert(permit: PermitView) {
    setPermits((prev) => {
      const idx = prev.findIndex((p) => p.id === permit.id);
      if (idx === -1) return [...prev, permit];
      const next = [...prev];
      next[idx] = permit;
      return next;
    });
  }

  function remove(permitId: number) {
    setPermits((prev) => prev.filter((p) => p.id !== permitId));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">
            Enforced Permits
          </h2>
          <p className="text-xs text-white/40">
            Fixed system tiers — un-quarantinable, user-assignable only.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {enforced.map((p) => (
            <PermitCard
              key={p.id}
              guildId={guildId}
              permit={p}
              roles={roles}
              members={members}
              onChange={upsert}
              onDelete={remove}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">
            Custom Permits
          </h2>
          <p className="text-xs text-white/40">
            Admin-defined node bundles — editable, role-assignable only.
          </p>
        </div>
        <CreatePermitCard guildId={guildId} onCreated={upsert} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {custom.map((p) => (
            <PermitCard
              key={p.id}
              guildId={guildId}
              permit={p}
              roles={roles}
              members={members}
              onChange={upsert}
              onDelete={remove}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CreatePermitCard({
  guildId,
  onCreated,
}: {
  guildId: string;
  onCreated: (permit: PermitView) => void;
}) {
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<string[]>([]);
  const [customNode, setCustomNode] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  function toggleNode(node: string) {
    setNodes((prev) =>
      prev.includes(node) ? prev.filter((n) => n !== node) : [...prev, node],
    );
  }

  function addCustomNode() {
    const trimmed = customNode.trim();
    if (!trimmed || nodes.includes(trimmed)) return;
    setNodes((prev) => [...prev, trimmed]);
    setCustomNode("");
  }

  function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || nodes.length === 0) {
      setError("Name and at least one node are required.");
      return;
    }
    run(async () => {
      const res = await createPermitAction(guildId, trimmedName, "custom", nodes);
      if (!res.ok || res.permitId === undefined) {
        setError(res.error ?? "Failed to create permit");
        return;
      }
      onCreated({
        id: res.permitId,
        name: trimmedName,
        kind: "custom",
        nodes,
        builtin: false,
        assignments: [],
      });
      setName("");
      setNodes([]);
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <div>
          <CardTitle>New Custom Permit</CardTitle>
          <CardDescription>
            Name it, pick its node bundle, then assign roles below.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-permit-name">Name</Label>
          <Input
            id="new-permit-name"
            placeholder="e.g. Junior Moderator"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <NodeChecklist nodes={nodes} onToggle={toggleNode} />
        <div className="flex gap-2">
          <Input
            placeholder="Add a custom node, e.g. filter.bypass"
            value={customNode}
            onChange={(e) => setCustomNode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomNode();
              }
            }}
          />
          <Button variant="secondary" size="sm" onClick={addCustomNode}>
            Add
          </Button>
        </div>
        <ActionError error={error} />
        <div>
          <Button size="sm" onClick={handleCreate} disabled={isPending}>
            {isPending ? "Creating…" : "Create Permit"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function NodeChecklist({
  nodes,
  onToggle,
}: {
  nodes: string[];
  onToggle: (node: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {KNOWN_PERMIT_NODE_GROUPS.map((group) => (
        <div key={group.prefix} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/30">
            {group.prefix}
          </span>
          <div className="flex flex-wrap gap-3">
            {group.nodes.map((node) => (
              <label
                key={node}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-white/80"
              >
                <input
                  type="checkbox"
                  checked={nodes.includes(node)}
                  onChange={() => onToggle(node)}
                  className="size-4 rounded border-border accent-accent-cyan"
                />
                <code>{node}</code>
              </label>
            ))}
          </div>
        </div>
      ))}
      {nodes.filter(
        (n) => !KNOWN_PERMIT_NODE_GROUPS.some((g) => g.nodes.includes(n)),
      ).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/30">
            custom
          </span>
          <div className="flex flex-wrap gap-2">
            {nodes
              .filter((n) => !KNOWN_PERMIT_NODE_GROUPS.some((g) => g.nodes.includes(n)))
              .map((node) => (
                <Badge key={node} variant="accent">
                  <code>{node}</code>
                  <button
                    type="button"
                    className="ml-1.5 text-white/50 hover:text-white"
                    onClick={() => onToggle(node)}
                  >
                    ×
                  </button>
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function targetLabel(
  assignment: PermitAssignmentView,
  roles: DashboardRoleView[],
  members: DashboardMemberView[],
): string {
  if (assignment.targetType === "role") {
    const role = roles.find((r) => r.id === assignment.targetId);
    return role ? `@${role.name}` : `role:${assignment.targetId}`;
  }
  const member = members.find((m) => m.id === assignment.targetId);
  return member ? member.displayName : `user:${assignment.targetId}`;
}

function PermitCard({
  guildId,
  permit,
  roles,
  members,
  onChange,
  onDelete,
}: {
  guildId: string;
  permit: PermitView;
  roles: DashboardRoleView[];
  members: DashboardMemberView[];
  onChange: (permit: PermitView) => void;
  onDelete: (permitId: number) => void;
}) {
  const locked = permit.builtin;
  const [name, setName] = useState(permit.name);
  const [pickedTarget, setPickedTarget] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  const targetType = permit.kind === "enforced" ? "user" : "role";
  const assignedIds = new Set(permit.assignments.map((a) => a.targetId));
  const eligible: { id: string; label: string }[] =
    targetType === "role"
      ? roles
          .filter((r) => !assignedIds.has(r.id))
          .map((r) => ({ id: r.id, label: r.name }))
      : members
          .filter((m) => !assignedIds.has(m.id))
          .map((m) => ({ id: m.id, label: m.displayName }));

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === permit.name) return;
    run(async () => {
      const res = await updatePermitAction(guildId, permit.id, { name: trimmed });
      if (!res.ok) {
        setError(res.error ?? "Rename failed");
        setName(permit.name);
        return;
      }
      onChange({ ...permit, name: trimmed });
    });
  }

  function toggleNode(node: string) {
    const nextNodes = permit.nodes.includes(node)
      ? permit.nodes.filter((n) => n !== node)
      : [...permit.nodes, node];
    if (nextNodes.length === 0) {
      setError("A permit needs at least one node.");
      return;
    }
    run(async () => {
      const res = await updatePermitAction(guildId, permit.id, {
        nodes: nextNodes,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to update nodes");
        return;
      }
      onChange({ ...permit, nodes: nextNodes });
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete permit "${permit.name}"? This can't be undone.`)) {
      return;
    }
    run(async () => {
      const res = await deletePermitAction(guildId, permit.id);
      if (!res.ok) {
        setError(res.error ?? "Delete failed");
        return;
      }
      onDelete(permit.id);
    });
  }

  function handleAssign() {
    if (!pickedTarget) return;
    run(async () => {
      const res = await assignPermitAction(guildId, permit.id, targetType, pickedTarget);
      if (!res.ok) {
        setError(res.error ?? "Assign failed");
        return;
      }
      onChange({
        ...permit,
        assignments: [
          ...permit.assignments,
          { id: -1, targetType, targetId: pickedTarget },
        ],
      });
      setPickedTarget("");
    });
  }

  function handleUnassign(targetId: string) {
    run(async () => {
      const res = await unassignPermitAction(guildId, permit.id, targetType, targetId);
      if (!res.ok) {
        setError(res.error ?? "Unassign failed");
        return;
      }
      onChange({
        ...permit,
        assignments: permit.assignments.filter((a) => a.targetId !== targetId),
      });
    });
  }

  return (
    <Card className={locked ? "border-white/5 bg-white/[0.015]" : undefined}>
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {locked ? (
              <CardTitle className="flex items-center gap-1.5">
                🔒 {permit.name}
              </CardTitle>
            ) : (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-8 max-w-64 font-semibold"
              />
            )}
            <div className="flex items-center gap-2">
              <Badge variant={permit.kind === "enforced" ? "accent" : "neutral"}>
                {permit.kind}
              </Badge>
              <Badge variant="neutral">
                {targetType === "role" ? "role-assignable" : "user-assignable"}
              </Badge>
            </div>
          </div>
          {!locked && (
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
              Delete
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="flex flex-col gap-4">
        {locked ? (
          <div className="flex flex-wrap gap-2">
            {permit.nodes.map((node) => (
              <Badge key={node}>
                <code>{node}</code>
              </Badge>
            ))}
          </div>
        ) : (
          <NodeChecklist nodes={permit.nodes} onToggle={toggleNode} />
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/30">
            Assigned {targetType === "role" ? "roles" : "members"} (
            {permit.assignments.length})
          </span>
          {permit.assignments.length === 0 ? (
            <p className="text-xs text-white/40">Nobody has this permit yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {permit.assignments.map((a) => (
                <Badge key={a.targetId} className="gap-1.5">
                  {targetLabel(a, roles, members)}
                  <button
                    type="button"
                    className="text-white/50 hover:text-white"
                    onClick={() => handleUnassign(a.targetId)}
                    disabled={isPending}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Select
              value={pickedTarget}
              onChange={(e) => setPickedTarget(e.target.value)}
              className="max-w-64"
            >
              <option value="">
                {eligible.length === 0
                  ? `No eligible ${targetType}s`
                  : `Pick a ${targetType}…`}
              </option>
              {eligible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAssign}
              disabled={isPending || !pickedTarget}
            >
              Assign
            </Button>
          </div>
        </div>

        <ActionError error={error} />
      </div>
    </Card>
  );
}
