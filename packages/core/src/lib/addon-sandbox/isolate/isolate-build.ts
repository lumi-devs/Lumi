import { mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAddonSourceFiles } from "../host/addon-files.js";
import { ensureAddonLumiLink } from "../host/sandbox-root.js";

const SandboxDir = path.dirname(fileURLToPath(import.meta.url));

export const IsolateRunnerEntry = fileURLToPath(
  new URL("../../../runtime/addon-isolate-runner.ts", import.meta.url),
);

export function nodeBin(): string {
  return process.env.LUMI_NODE_BIN ?? "node";
}

export interface IsolateBundle {
  path: string;
}

function entrySource(parts: {
  dispatch: string;
  commands: string[];
  handlers: string[];
  index: string | null;
}): string {
  const lines = [
    `import { addCommand, addInteractionHandler, describeAddon, initIsolateTransport, invokeAddon, setConfigFields } from ${JSON.stringify(parts.dispatch)};`,
    `initIsolateTransport((e) => __hostCall.apply(undefined, [e], { arguments: { copy: true }, result: { promise: true, copy: true } }));`,
  ];
  parts.commands.forEach((file, i) => lines.push(`import def${i} from ${JSON.stringify(file)};`));
  parts.handlers.forEach((file, i) => lines.push(`import h${i} from ${JSON.stringify(file)};`));
  if (parts.index) lines.push(`import * as indexMod from ${JSON.stringify(parts.index)};`);
  parts.commands.forEach((_, i) => lines.push(`addCommand(def${i});`));
  parts.handlers.forEach((_, i) => lines.push(`addInteractionHandler(h${i});`));
  if (parts.index)
    lines.push(
      `{ const meta = (indexMod as { meta?: { configFields?: unknown } }).meta;` +
        ` if (Array.isArray(meta?.configFields)) setConfigFields(meta.configFields as import("@lumi/contracts").ConfigField[]); }`,
    );
  lines.push(
    `(globalThis as Record<string, unknown>).__describe = describeAddon;`,
    `(globalThis as Record<string, unknown>).__invoke = invokeAddon;`,
  );
  return lines.join("\n") + "\n";
}

export async function buildIsolateBundle(addonDir: string, addonName: string): Promise<IsolateBundle> {
  if (
    !(await stat(addonDir).then(
      () => true,
      () => false,
    ))
  )
    throw new Error(`Addon directory ${addonDir} does not exist`);
  await ensureAddonLumiLink(addonDir);
  const dir = await mkdtemp(path.join(os.tmpdir(), `lumi-isolate-${addonName}-`));
  const commands = await listAddonSourceFiles(path.join(addonDir, "commands"));
  const handlers = await listAddonSourceFiles(path.join(addonDir, "interaction-handlers"));
  const index = path.join(addonDir, "index.ts");
  const entry = entrySource({
    dispatch: path.join(SandboxDir, "dispatch.ts"),
    commands,
    handlers,
    index: await stat(index).then(
      () => index,
      () => null,
    ),
  });
  const entryPath = path.join(dir, "entry.ts");
  await writeFile(entryPath, entry);

  let result;
  try {
    result = await Bun.build({
      entrypoints: [entryPath],
      outdir: dir,
      format: "iife",
      target: "browser",
      minify: false,
    naming: "addon.bundle.js",
  });
  } catch (err) {
    const withLogs = err as { logs?: { message: string }[]; errors?: unknown[] };
    const detail =
      withLogs.logs?.map((l) => l.message).join("\n") ??
      withLogs.errors?.map((e) => (e instanceof Error ? e.message : String(e))).join("\n") ??
      String(err);
    throw new Error(`Isolate bundle build failed for addon "${addonName}":\n${detail}`);
  }
  if (!result.success) {
    const detail = result.logs.map((l) => l.message).join("\n");
    throw new Error(`Isolate bundle build failed for addon "${addonName}":\n${detail}`);
  }
  return { path: path.join(dir, "addon.bundle.js") };
}
