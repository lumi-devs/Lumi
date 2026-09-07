// Bun.spawn never rejects on a nonzero exit code, unlike Node's execFile - checked explicitly below.
export interface ExecFileOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeout?: number;
}

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export class ExecFileError extends Error {
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
  if (typeof Bun !== "undefined") {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: opts.cwd,
      env: opts.env as Record<string, string> | undefined,
      stdout: "pipe",
      stderr: "pipe",
      signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : undefined,
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

  const { execFile } = await import("node:child_process");
  return new Promise<ExecFileResult>((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        env: opts.env,
        timeout: opts.timeout,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const code =
            typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code)
              : null;
          reject(
            new ExecFileError(
              cmd,
              args,
              String(stdout),
              String(stderr),
              code,
              (error as { killed?: boolean }).killed ?? false,
            ),
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}
