import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export const help = `Usage: lumi migrate [status]

Runs Prisma migrations against POSTGRES_URL - the same command the
docker-compose \`migrate\` one-shot service runs before worker/api/scheduler
start.

  lumi migrate          bunx prisma migrate deploy
  lumi migrate status   bunx prisma migrate status
`;

export async function run(argv: string[]): Promise<number> {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h") {
    console.log(help);
    return 0;
  }
  if (sub && sub !== "status" && sub !== "deploy") {
    console.error(`Unknown migrate subcommand "${sub}". Expected "status" or nothing (deploy).`);
    return 2;
  }
  const prismaCommand = sub === "status" ? "status" : "deploy";

  const proc = Bun.spawn(["bunx", "prisma", "migrate", prismaCommand], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
}
