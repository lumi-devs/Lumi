import { parseArgs } from "node:util";
import { doctorExitCode, formatDoctorReport, runDoctor } from "@lumi/core/doctor";

export const help = `Usage: lumi doctor [--json]

Run the doctor check suite: validates Discord token, database, Valkey, RPC,
dashboard OAuth configuration, filesystem, addons, and job queue health.

Prints a line per check, exit code 1 if any fail, 0 otherwise (warnings
don't fail the suite). Emit JSON with --json for scripting/CI.

Options:
  --json        Emit machine-readable JSON report.
  --help, -h    Show this help text.
`;

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    console.log(help);
    return 0;
  }

  if (positionals.length > 0) {
    console.error(help);
    return 2;
  }

  const results = await runDoctor();
  const report = formatDoctorReport(results, { json: values.json === true });
  console.log(report);
  return doctorExitCode(results);
}
