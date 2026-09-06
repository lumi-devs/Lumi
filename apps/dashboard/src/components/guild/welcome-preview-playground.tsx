"use client";

import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Field, Input, Textarea } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import {
  DiscordMessagePreview,
  type PreviewEmbed,
} from "#/components/guild/discord-message-preview";

export interface WelcomePreviewVars {
  user: string;
  username: string;
  nickname: string;
  server: string;
  memberCount: number;
}

/** Mirrors the worker's template renderer (`renderWelcomeTemplate` in
 *  `packages/core/src/modules/welcome/lib/template.ts`): the known
 *  placeholders substitute, everything else stays verbatim. */
export function resolveWelcomePreview(
  template: string,
  vars: WelcomePreviewVars,
): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (match, name: string) => {
    switch (name) {
      case "user":
        return vars.user;
      case "username":
        return vars.username;
      case "nickname":
        return vars.nickname;
      case "server":
        return vars.server;
      case "memberCount":
      case "memberNumber":
        return String(vars.memberCount);
      default:
        return match;
    }
  });
}

const SampleMention = "@Alex";

export function WelcomePreviewPlayground({
  defaultWelcomeTemplate,
  defaultGoodbyeTemplate,
  defaultDmTemplate,
}: {
  defaultWelcomeTemplate?: string;
  defaultGoodbyeTemplate?: string;
  defaultDmTemplate?: string;
}) {
  const [memberName, setMemberName] = useState("Alex");
  const [serverName, setServerName] = useState("Acme Café");
  const [members, setMembers] = useState(128);
  const [welcomeTemplate, setWelcomeTemplate] = useState(
    defaultWelcomeTemplate ?? "Welcome {user} to {server}! You are member #{memberCount}.",
  );
  const [goodbyeTemplate, setGoodbyeTemplate] = useState(
    defaultGoodbyeTemplate ?? "{username} has left {server}.",
  );
  const [dmTemplate, setDmTemplate] = useState(
    defaultDmTemplate ?? "Welcome to {server}, {username}!",
  );
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [goodbyeEnabled, setGoodbyeEnabled] = useState(true);
  const [dmEnabled, setDmEnabled] = useState(true);
  const [autoRoleEnabled, setAutoRoleEnabled] = useState(true);
  const [autoRoleName, setAutoRoleName] = useState("Newcomer");

  const displayName = memberName.trim() || "Alex";
  const handle =
    displayName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "alex";
  const server = serverName.trim() || "Acme Café";
  const currentMembers = Number.isFinite(members) && members >= 0 ? Math.floor(members) : 0;

  const welcomeVars: WelcomePreviewVars = {
    user: SampleMention,
    username: handle,
    nickname: displayName,
    server,
    memberCount: currentMembers + 1,
  };
  const goodbyeVars: WelcomePreviewVars = {
    user: SampleMention,
    username: handle,
    nickname: displayName,
    server,
    memberCount: Math.max(0, currentMembers - 1),
  };

  const welcomeEmbed: PreviewEmbed = {
    accentColor: "#23a55a",
    title: "👋 Welcome",
    body: [resolveWelcomePreview(welcomeTemplate, welcomeVars)],
    footer: autoRoleEnabled ? `Auto-roles: @${autoRoleName.trim() || "Newcomer"}` : undefined,
  };
  const goodbyeEmbed: PreviewEmbed = {
    title: "Member left",
    body: [resolveWelcomePreview(goodbyeTemplate, goodbyeVars)],
  };
  const dmEmbed: PreviewEmbed = {
    title: `👋 Welcome to ${server}`,
    body: [resolveWelcomePreview(dmTemplate, welcomeVars)],
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">Preview only — edits never save</Badge>
        <p className="text-[13px] text-fg-subtle">
          Placeholders: {"{user}"}, {"{username}"}, {"{nickname}"},{" "}
          {"{server}"}, {"{memberCount}"} (alias {"{memberNumber}"}). Sample
          server: {currentMembers} members — a join makes #
          {currentMembers + 1}, a leave makes #
          {Math.max(0, currentMembers - 1)}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Member" htmlFor="welcome-preview-name">
          <Input
            id="welcome-preview-name"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="Alex"
            spellCheck={false}
          />
        </Field>
        <Field label="Server" htmlFor="welcome-preview-server">
          <Input
            id="welcome-preview-server"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="Acme Café"
            spellCheck={false}
          />
        </Field>
        <Field label="Server members" htmlFor="welcome-preview-members">
          <Input
            id="welcome-preview-members"
            type="number"
            min={0}
            value={members}
            onChange={(e) => setMembers(Number(e.target.value))}
            className="tabular"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Welcome template"
          htmlFor="welcome-preview-welcome-template"
          hint="Posted in the welcome channel when someone joins."
        >
          <Textarea
            id="welcome-preview-welcome-template"
            value={welcomeTemplate}
            onChange={(e) => setWelcomeTemplate(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field
          label="Goodbye template"
          htmlFor="welcome-preview-goodbye-template"
          hint="Posted in the goodbye channel when someone leaves."
        >
          <Textarea
            id="welcome-preview-goodbye-template"
            value={goodbyeTemplate}
            onChange={(e) => setGoodbyeTemplate(e.target.value)}
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="DM greeting template"
          htmlFor="welcome-preview-dm-template"
          hint="Sent as a DM to the new member."
        >
          <Textarea
            id="welcome-preview-dm-template"
            value={dmTemplate}
            onChange={(e) => setDmTemplate(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Auto-role" htmlFor="welcome-preview-autorole">
          <Input
            id="welcome-preview-autorole"
            value={autoRoleName}
            onChange={(e) => setAutoRoleName(e.target.value)}
            placeholder="Newcomer"
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-fg">
          <Switch
            checked={welcomeEnabled}
            onChange={setWelcomeEnabled}
            aria-label="Post welcome in channel"
          />
          Post welcome in channel
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-fg">
          <Switch
            checked={goodbyeEnabled}
            onChange={setGoodbyeEnabled}
            aria-label="Post goodbye in channel"
          />
          Post goodbye in channel
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-fg">
          <Switch
            checked={dmEnabled}
            onChange={setDmEnabled}
            aria-label="Send DM greeting"
          />
          Send DM greeting
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-fg">
          <Switch
            checked={autoRoleEnabled}
            onChange={setAutoRoleEnabled}
            aria-label="Assign auto-role"
          />
          Assign auto-role
        </label>
      </div>

      {welcomeEnabled ? (
        <DiscordMessagePreview
          channelName="welcome"
          channelTopic={`Say hi to ${displayName}`}
          body={`${SampleMention} just joined ${server} — this is what members see.`}
          username="Lumi"
          timestamp="Today at 4:21 PM"
          embed={welcomeEmbed}
        />
      ) : (
        <p className="text-[13px] text-fg-subtle">
          Welcome card disabled — nothing will post on join.
        </p>
      )}

      {goodbyeEnabled ? (
        <DiscordMessagePreview
          channelName="goodbye"
          body={`${handle} just left ${server} — this is what members see.`}
          username="Lumi"
          timestamp="Today at 4:22 PM"
          embed={goodbyeEmbed}
        />
      ) : (
        <p className="text-[13px] text-fg-subtle">
          Goodbye card disabled — nothing will post on leave.
        </p>
      )}

      {dmEnabled ? (
        <DiscordMessagePreview
          channelName="Direct Message"
          channelTopic="DM from Lumi"
          username="Lumi"
          timestamp="Today at 4:21 PM"
          embed={dmEmbed}
        />
      ) : (
        <p className="text-[13px] text-fg-subtle">
          DM greeting disabled — new members get no DM.
        </p>
      )}
    </div>
  );
}
