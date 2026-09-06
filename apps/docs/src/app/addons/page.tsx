import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Add-ons",
  description: "Ship third-party Lumi modules against the stable lumi import surface.",
};

const scaffold = `bun run addon:create     # scaffold a third-party module
bun run validate         # run the add-on validator against your module
bun run modules:manifest # regenerate manifests after versioning`;

const devPath = `LUMI_DEV_PATHS=/home/dev/my-modules:/home/dev/other-modules`;

export default function AddonsPage() {
  return (
    <DocPage
      title="Add-ons"
      lede="Third-party modules plug into the same loader as bundled ones, but they build against a small stable SDK — never core internals."
      path="/addons"
    >
      <h2>The stable import surface</h2>
      <p>
        Downloaded modules are symlinked into <code>packages/core/src/modules/</code> from{" "}
        <code>data/3rd-party-modules/</code>, yet they must not reach into{" "}
        <code>#core</code>, <code>#lib</code>, <code>#database</code>, or{" "}
        <code>#utilities</code>. The one supported surface is the <code>lumi</code> package,
        exported from the repo root:
      </p>
      <ul>
        <li>
          <code>lumi</code> — module definition, schema builders, core types.
        </li>
        <li>
          <code>lumi/commands</code> — command building blocks.
        </li>
        <li>
          <code>lumi/permissions</code> — permit checks and node vocabulary.
        </li>
        <li>
          <code>lumi/scheduling</code> — scheduled-task effects.
        </li>
        <li>
          <code>lumi/ui</code> — cards and panel builders.
        </li>
        <li>
          <code>lumi/utils</code> — shared utilities.
        </li>
      </ul>
      <p>
        Because an add-on file&apos;s nearest <code>package.json</code> is the repo root,{" "}
        <code>import … from &quot;lumi&quot;</code> self-resolves via the package self-reference
        — no install step needed. The add-on validator flags escapes (such as touching the raw
        Prisma client) as errors.
      </p>

      <h2>Scaffold, validate, publish</h2>
      <CodeBlock code={scaffold} language="bash" title="Add-on workflow" />
      <p>
        Distribution runs through the downloader RPC actions: register a repo with{" "}
        <code>downloader.repo.add</code>, browse it with <code>downloader.repo.modules</code>,
        then <code>downloader.module.install</code>, <code>downloader.module.uninstall</code>, or{" "}
        <code>downloader.module.rollback</code> to a pinned revision — all from the dashboard,
        no shell access required.
      </p>

      <h2>Local development</h2>
      <p>
        Point the worker at out-of-tree module directories with <code>LUMI_DEV_PATHS</code> (the
        equivalent of RedBot&apos;s <code>--cog-path</code>). Modules there are discovered and
        loaded exactly like bundled ones; the variable is env-only, non-persistent, and must
        never be set in production.
      </p>
      <CodeBlock code={devPath} language="bash" title="Dev module paths" />

      <h2>Rules for add-on authors</h2>
      <ul>
        <li>
          Import only from <code>lumi</code> and its subpaths — never relative paths across
          package boundaries.
        </li>
        <li>
          Declare data handling honestly: use <code>NoEndUserData()</code> when the module stores
          nothing about end users, or describe what it keeps.
        </li>
        <li>
          Follow the same module rules as core code: typed <code>configSchema</code>, UI kits for
          embeds and panels, permit nodes for gated commands. See{" "}
          <a href="/modules">Module Creation</a>.
        </li>
      </ul>
    </DocPage>
  );
}
