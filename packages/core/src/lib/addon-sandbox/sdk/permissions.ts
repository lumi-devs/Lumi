import { call } from "./rpc.js";

export function checkPermit(node: string): Promise<void> {
  return call("ctx.checkPermit", { node });
}
