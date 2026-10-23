import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = process.env["LUMI_ROOT"] ?? process.cwd();
export const modulesRoot = fileURLToPath(new URL("./modules/", import.meta.url));
export const addonsRoot = path.join(repoRoot, "data", "addons");
export const version = "0.1.0";
