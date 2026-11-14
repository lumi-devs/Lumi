import { runSetup } from "./setup/index.ts";
import { parseArgs, usage } from "./setup/shared.ts";

async function main(): Promise<void> {
  try {
    const code = await runSetup(parseArgs(process.argv.slice(2)));
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
