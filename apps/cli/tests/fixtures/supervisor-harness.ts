import { runSupervisor, type ChildSpec } from "../../src/lib/supervisor.js";

const specsJson = process.argv[2];
if (!specsJson) throw new Error("usage: supervisor-harness.ts '<json ChildSpec[]>'");
const specs = JSON.parse(specsJson) as ChildSpec[];

const code = await runSupervisor(specs);
console.log(`HARNESS_EXIT=${code}`);
process.exit(code);
