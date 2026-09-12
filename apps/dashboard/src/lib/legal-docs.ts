import { readFile } from "node:fs/promises";
import path from "node:path";

const LegalDir = path.join(process.cwd(), "content", "legal");

export async function readLegalDoc(file: "PRIVACY_POLICY.md" | "TERMS_OF_SERVICE.md"): Promise<string> {
  return readFile(path.join(LegalDir, file), "utf8");
}
