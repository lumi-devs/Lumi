import { createHash } from "node:crypto";
import { dashboardKey, getRedis } from "./redis.js";

const ConsumeScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const digest = createHash("sha256").update(identifier).digest("hex");
  const key = dashboardKey("rate", scope, digest);
  const count = await getRedis().eval(
    ConsumeScript,
    1,
    key,
    String(windowSeconds),
  );
  return Number(count) <= max;
}
