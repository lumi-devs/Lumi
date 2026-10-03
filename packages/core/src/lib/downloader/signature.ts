import { execFileAsync } from "#lib/utilities/exec-file.js";

/**
 * Result of verifying a single commit's SSH signature against a git
 * `allowed_signers` file, via `git verify-commit -c gpg.format=ssh`.
 *
 * `signer` is the principal (the first field of the matching allowed_signers
 * line) git resolves the signature to - it is never the raw SSH public key.
 */
export type SignatureVerification =
  | { status: "valid"; signer: string }
  | { status: "unsigned" }
  | { status: "untrusted"; detail: string }
  | { status: "invalid"; detail: string };

const GoodSignatureRe = /Good "git" signature for ([^\s]+)/;
const NoSignatureRe = /no signature found/i;
const NoPrincipalRe = /no principal matched/i;

/**
 * Runs `git verify-commit --raw <sha>` against `repoPath` with
 * `gpg.format=ssh` and the given allowed-signers file, and classifies the
 * result.
 *
 * git's ssh signature verification always writes its human-readable verdict
 * to stderr (both on success and failure) - stdout only carries the raw
 * signature payload with `--raw`, so the signer principal is parsed out of
 * stderr, not stdout.
 */
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

    // git verify-commit prints nothing at all - to either stream - for a
    // commit with no signature; every other failure mode (bad signature,
    // untrusted signer) writes a diagnostic to stderr.
    if (!stderr.trim() && !stdout.trim()) return { status: "unsigned" };
    if (NoSignatureRe.test(stderr)) return { status: "unsigned" };
    if (NoPrincipalRe.test(stderr)) {
      return { status: "untrusted", detail: stderr.trim() };
    }
    return { status: "invalid", detail: stderr.trim() };
  }
}
