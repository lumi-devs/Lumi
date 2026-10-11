import { execFileAsync } from "#src/lib/utilities/ExecFile.js";

export type SignatureVerification =
  | { status: "valid"; signer: string }
  | { status: "unsigned" }
  | { status: "untrusted"; detail: string }
  | { status: "invalid"; detail: string };

const GoodSignatureRe = /Good "git" signature for ([^\s]+)/;
const NoSignatureRe = /no signature found/i;
const NoPrincipalRe = /no principal matched/i;

export async function verifyCommitSignature(
  repoPath: string,
  sha: string,
  allowedSignersFile: string,
): Promise<SignatureVerification> {
  const args = [
    "-c",
    "gpg.format=ssh",
    "-c",
    `gpg.ssh.allowedSignersFile=${allowedSignersFile}`,
    "-C",
    repoPath,
    "verify-commit",
    "--raw",
    sha,
  ];

  try {
    const { stderr } = await execFileAsync("git", args, {
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const signer = GoodSignatureRe.exec(stderr)?.[1];
    if (signer) return { status: "valid", signer };
    return {
      status: "invalid",
      detail: stderr.trim() || "verify-commit exited successfully without a recognizable signer.",
    };
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    const stderr = execErr.stderr ?? (err instanceof Error ? err.message : String(err));
    const stdout = execErr.stdout ?? "";

    if (!stderr.trim() && !stdout.trim()) return { status: "unsigned" };
    if (NoSignatureRe.test(stderr)) return { status: "unsigned" };
    if (NoPrincipalRe.test(stderr)) {
      return { status: "untrusted", detail: stderr.trim() };
    }
    return { status: "invalid", detail: stderr.trim() };
  }
}
