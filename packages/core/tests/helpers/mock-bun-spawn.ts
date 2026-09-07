export function fakeSpawnResult(
  stdout: string,
  stderr = "",
  exitCode = 0,
  signalCode: string | null = null,
) {
  return {
    stdout: new Response(stdout).body,
    stderr: new Response(stderr).body,
    exited: Promise.resolve(exitCode),
    exitCode,
    signalCode,
  };
}
