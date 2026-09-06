import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Module Creation",
  description: "Build a Lumi feature module with DefineModule and a typed config schema.",
};

const minimalModule = `import { DefineModule, Module, cfg, NoEndUserData } from "lumi";

@DefineModule({
  name: "greeter",
  displayName: "Greeter",
  description: "Welcomes new members in a chosen channel.",
  category: "Community",
  endUserDataStatement: NoEndUserData(),
  configSchema: cfg.object({
    channel: cfg.channel({
      label: "Welcome channel",
      description: "Where greetings are posted.",
    }),
    message: cfg.string({
      label: "Message",
      description: "Posted for each new member.",
      default: "Welcome!",
    }),
    pingNewcomer: cfg.boolean({
      label: "Mention newcomer",
      description: "Mention the member in the greeting.",
      default: true,
    }),
    keepFor: cfg.duration({
      label: "Keep for",
      description: "How long greetings stay up.",
      default: "24h",
      quickPicks: ["1h", "24h", "7d"],
    }),
    greeterRoles: cfg.multiRole({
      label: "Greeter roles",
      description: "Roles allowed to resend greetings.",
      required: false,
    }),
  }),
})
export class GreeterModule extends Module {}`;

const layout = `packages/core/src/modules/greeter/
  index.ts                  # the @DefineModule class above
  commands/                 # Sapphire slash / context-menu commands
  listeners/                # Discord gateway event listeners
  services/                 # long-lived helpers, fetched from the container
  interaction-handlers/     # button / select-menu / modal handlers
  scheduled-tasks/          # BullMQ-fired effects, fanned out over Redis`;

export default function ModulesPage() {
  return (
    <DocPage
      title="Module Creation"
      lede="A module is a Sapphire piece with declared metadata and a typed config schema. The decorator below is a complete, working starting point."
      path="/modules"
    >
      <h2>A minimal module</h2>
      <p>
        Live under <code>packages/core/src/modules/&lt;name&gt;/</code> and export a class
        extending <code>Module</code>, decorated with <code>DefineModule</code> (both from{" "}
        <code>packages/core/src/lib/module-system/Module.ts</code>). The schema is the single
        source of truth: it validates writes, and the dashboard renders its config form from the
        derived fields — no form code to write.
      </p>
      <CodeBlock code={minimalModule} language="typescript" title="Greeter module" />

      <h2>Metadata reference</h2>
      <p>
        <code>name</code> defaults to the class name lowercased with a trailing{" "}
        <code>Module</code> stripped; <code>version</code> defaults to the core version;{" "}
        <code>disableable</code> and <code>configOverrides</code> default to{" "}
        <code>true</code>. Set <code>category</code> to place the module in a dashboard sidebar
        group (it falls back to <code>System</code>), or <code>dashboardHref</code> for a bespoke
        settings page instead of the generic form. Declare GDPR posture explicitly with{" "}
        <code>NoEndUserData()</code> when the module stores nothing about end users.
      </p>

      <h2>Config field builders</h2>
      <p>
        Every builder takes a <code>label</code>, a <code>description</code>, and an optional{" "}
        <code>required</code> flag, <code>default</code>, and panel <code>group</code>. The
        available builders, matching the <code>FieldType</code> contract, are:
      </p>
      <ul>
        <li>
          <code>cfg.string</code>, <code>cfg.number</code>, <code>cfg.boolean</code>,{" "}
          <code>cfg.enum</code> — scalars. A <code>number</code> with <code>step</code> renders as
          a range slider instead of a number box.
        </li>
        <li>
          <code>cfg.channel</code>, <code>cfg.role</code>, <code>cfg.user</code> — Discord
          snowflake pickers (channels accept a <code>channelTypes</code> restriction).
        </li>
        <li>
          <code>cfg.duration</code> — stored as a string like <code>10m</code>, <code>2h</code>,{" "}
          <code>7d</code>, with optional <code>quickPicks</code> presets.
        </li>
        <li>
          <code>cfg.multiRole</code>, <code>cfg.multiChannel</code>,{" "}
          <code>cfg.multiUser</code> — stored as string arrays of snowflakes.
        </li>
        <li>
          <code>cfg.stringList</code> — a string array of free-text entries.
        </li>
      </ul>

      <h2>Module layout</h2>
      <CodeBlock code={layout} language="text" title="Directory layout" />

      <h2>Rules every module follows</h2>
      <ul>
        <li>
          <strong>Zero cross-module imports.</strong> A module never imports from a sibling
          module. Shared code belongs in <code>#lib</code>, <code>#database</code>, or{" "}
          <code>#utilities</code>.
        </li>
        <li>
          <strong>Database access goes through <code>container.db</code>.</strong> Never touch{" "}
          <code>container.prisma</code> directly, and invalidate shared Redis keys via{" "}
          <code>container.invalidation</code>, never a raw delete.
        </li>
        <li>
          <strong>Use the UI kits.</strong> Discord embeds come from the card builders (
          <code>makeInfoCard</code>, <code>makeSuccessCard</code>, <code>makeErrorCard</code>, …),
          admin panels from the panel kit (<code>settingRow</code>, <code>tabRow</code>,{" "}
          <code>confirmRow</code>, …), and command replies from the reply helpers (
          <code>replySuccess</code>, <code>replyError</code>).
        </li>
        <li>
          <strong>Register permit nodes.</strong> A permit-gated command&apos;s dot-notation node
          (e.g. <code>mod.ban</code>) belongs in the canonical vocabulary so the dashboard
          permit editor and autocomplete pick it up.
        </li>
        <li>
          <strong>Bounded options get autocomplete.</strong> A string option whose values are a
          real discoverable set (permit, module, or repo names) wires{" "}
          <code>Command.autocompleteRun</code> with the shared filter/respond helpers instead of
          free text.
        </li>
      </ul>
    </DocPage>
  );
}
