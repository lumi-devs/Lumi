import { runValidateAddon } from "#src/scripts/ValidateAddon.ts";
import { CliExitError, runCreateAddon } from "../../../scripts/CreateAddon.js";

export const help = `Usage: lumi addon <create|validate> [args...]

  lumi addon create <name> [options]      Scaffold a new addon (same as
                                           \`bun run addon:create\`).
  lumi addon validate <addon-dir|repo>    Validate addon structure (same as
                                           \`bun run validate\`).

\`create\` and \`validate\` share their implementation with the standalone
\`bun run addon:create\` / \`bun run validate\` scripts - this is a thin
wrapper, not a second copy. Run "lumi addon <subcommand> --help" for
subcommand-specific options.
`;

export async function run(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(help);
    return 0;
  }
  if (!sub) {
    console.error(help);
    return 2;
  }

  if (sub === "create") {
    try {
      return await runCreateAddon(rest);
    } catch (err) {
      if (err instanceof CliExitError) return err.exitCode;
      throw err;
    }
  }

  if (sub === "validate") {
    return runValidateAddon(rest);
  }

  console.error(`Unknown addon subcommand "${sub}". Expected "create" or "validate".`);
  return 2;
}
