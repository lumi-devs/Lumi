import type { ModuleServices } from "@lumi/module-kit";
import { describe, expect, it, vi } from "vitest";
import { runBulkRoleJob } from "../../modules/roles/bulkrole/runner.js";
import type { BulkRoleJob } from "../../modules/roles/bulkrole/store.js";

const job = {
  id: "job-1",
  guildId: "guild-1",
  status: "pending",
} as BulkRoleJob;

describe("bulk role worker claim", () => {
  it("exits without touching the guild when another worker owns the job", async () => {
    const claim = vi.fn(async () => ({ count: 0 }));
    const getGuild = vi.fn();
    const services = {
      helpers: { roles: { bulkRole: { claim } } },
      client: { guilds: { cache: { get: getGuild } } },
    } as unknown as ModuleServices;

    await runBulkRoleJob(services, job);

    expect(claim).toHaveBeenCalledWith("job-1", 300_000);
    expect(getGuild).not.toHaveBeenCalled();
  });
});
