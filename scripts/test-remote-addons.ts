// Boots a monolith, adds an addons repo, installs every module it exposes,
// asserts each one registers as a loaded ModuleStore record with its pieces,
// then uninstalls it again. Exit 0 = all pass, 1 = any failure.
//
//   bun scripts/test-remote-addons.ts [repo-url]
//
// Defaults to the public lumi-addons repo; pass a file:// URL to verify a
// local working copy before pushing. Requires the compose datastores
// (postgres/redis/rabbitmq) and a valid BOT_TOKEN in .env.
import "@lumi/core/setup";
import { container } from "@sapphire/framework";
import { LumiClient, envParseString } from "@lumi/core";
import type { DownloaderService } from "../packages/core/src/lib/services/DownloaderService.js";

const repoUrl =
  process.argv[2] ?? "https://github.com/lumi-devs/lumi-addons.git";
const REPO = "verify-addons";

const failures: string[] = [];
const fail = (msg: string) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};

const client = await LumiClient.bootstrap().catch((err: unknown): never => {
  console.error(
    `[verify-addons] Fatal during bootstrap: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
await client.login(envParseString("BOT_TOKEN"));
console.log(`[verify-addons] Online. Repo under test: ${repoUrl}`);

const downloader = container.stores
  .get("services")
  .get("downloader") as DownloaderService;
const modules = container.stores.get("modules");

try {
  await downloader.removeRepo(REPO).catch(() => null);
  await downloader.addRepo(REPO, repoUrl, "default");
  const available = await downloader.getModulesInRepo(REPO);
  console.log(
    `[verify-addons] ${available.length} modules: ${available.map((m) => m.name).join(", ")}`,
  );
  if (available.length === 0) fail("repo exposes no modules");

  for (const info of available) {
    const name = info.name;
    console.log(`\n[verify-addons] ── ${name}@${info.version}`);
    try {
      // A previous run (or a real install) may have left it installed.
      await downloader.uninstallModule(name).catch(() => null);
      await downloader.installModule(REPO, name);

      const record = modules.get(name);
      if (!record) {
        fail(`${name}: no ModuleStore record after install`);
        continue;
      }
      const piece = modules.loaded().find((r) => r.name === name);
      if (!piece) {
        fail(`${name}: record exists but not loaded`);
        continue;
      }

      // Count pieces the module contributed across all stores.
      let pieces = 0;
      for (const store of container.stores.values()) {
        if (store === modules) continue;
        for (const p of store.values()) {
          if (p.location.full.includes(`/installed-modules/${name}/`))
            pieces++;
        }
      }
      console.log(`  ✓ loaded (${pieces} pieces registered)`);

      await downloader.uninstallModule(name);
      if (modules.loaded().some((r) => r.name === name)) {
        fail(`${name}: still loaded after uninstall`);
      } else {
        console.log("  ✓ uninstalled cleanly");
      }
    } catch (err) {
      fail(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await downloader.removeRepo(REPO).catch(() => null);
} finally {
  await client.destroy().catch(() => null);
}

if (failures.length > 0) {
  console.error(`\n[verify-addons] FAIL — ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\n[verify-addons] PASS — all modules install, load, uninstall");
process.exit(0);
