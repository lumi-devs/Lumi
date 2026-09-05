import { readFile } from "node:fs/promises";
import path from "node:path";

// Single source of truth stays in .github/ where the repo's own contributors
// already edit it; these pages just render the same file server-side instead
// of forking a copy that can drift out of sync.
const RepoRoot = path.resolve(process.cwd(), "..", "..");

export async function readLegalDoc(file: "PRIVACY_POLICY.md" | "TERMS_OF_SERVICE.md"): Promise<string> {
  return readFile(path.join(RepoRoot, ".github", file), "utf8");
}
