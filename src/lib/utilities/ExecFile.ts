
export interface ExecFileOptions {
  cwd?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
  timeout?: number | undefined;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

class ExecFileError extends Error {
  public readonly stderr: string;
  public readonly stdout: string;
  public readonly code: number | null;
  public readonly killed: boolean;

  constructor(
    cmd: string,
    args: string[],
    stdout: string,
    stderr: string,
    code: number | null,
    killed: boolean,
  ) {
    super(
      killed
        ? `Command timed out: ${cmd} ${args.join(" ")}`
        : `Command failed: ${cmd} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`,
    );
    this.name = "ExecFileError";
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
    this.killed = killed;
  }
}

export async function execFileAsync(
  cmd: string,
  args: string[] = [],
  opts: ExecFileOptions = {},
): Promise<ExecFileResult> {
  const proc = Bun.spawn([cmd, ...args], {
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    stdout: "pipe",
    stderr: "pipe",
    ...(opts.timeout !== undefined
      ? { signal: AbortSignal.timeout(opts.timeout) }
      : {}),
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const killed = proc.signalCode !== null;
  if (proc.exitCode !== 0 || killed) {
    throw new ExecFileError(cmd, args, stdout, stderr, proc.exitCode, killed);
  }

  return { stdout, stderr };
}
