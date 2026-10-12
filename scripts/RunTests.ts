import { Glob } from "bun";

const files = [];
const glob = new Glob("tests/**/*.test.ts");
for await (const file of glob.scan(".")) files.push(file);
files.sort();

let passFiles = 0;
let failFiles = 0;
const failed: string[] = [];

for (const file of files) {
  const proc = Bun.spawn(["bun", "test", file], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const combined = `${out}\n${err}`;
  const m = combined.match(/(\d+) pass.*?(\d+) fail/s);
  const crashed = code !== 0 && !m;
  if (!crashed && m && Number(m[2]) === 0) {
    passFiles++;
  } else {
    failFiles++;
    failed.push(file);
    console.log(`--- FAIL: ${file} (exit ${code}) ---`);
    const tail = (out + err).trim().split("\n").slice(-15).join("\n");
    console.log(tail);
  }
}

console.log(`\n${passFiles} files pass, ${failFiles} files fail, ${files.length} total`);
if (failed.length > 0) {
  console.log("failed files:");
  for (const f of failed) console.log(`  ${f}`);
  process.exit(1);
}
