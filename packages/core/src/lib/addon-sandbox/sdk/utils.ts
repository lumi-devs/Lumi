export { parseDuration, formatDuration } from "@lumi/lib/utilities/time.js";
export { errorFrom, swallow } from "@lumi/shared";
import { call } from "./rpc.js";

export function randomHex(bytes: number): Promise<string> {
  return call("util.randomHex", { bytes });
}

export function sha256Hex(text: string): Promise<string> {
  return call("util.sha256Hex", { text });
}

export function sleep(ms: number): Promise<void> {
  return call("util.sleep", { ms });
}
