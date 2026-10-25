import { Client } from "discord.js";

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; details?: any }>;
}

export class HealthMonitor {
  private checks: HealthCheck[] = [];

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  async runChecks(): Promise<{ healthy: boolean; results: Array<{ name: string; healthy: boolean; details?: any }> }> {
    const results = await Promise.all(
      this.checks.map(async (check) => {
        try {
          const result = await check.check();
          return { name: check.name, ...result };
        } catch (error) {
          return { name: check.name, healthy: false, details: String(error) };
        }
      })
    );

    const healthy = results.every((r) => r.healthy);
    return { healthy, results };
  }
}

export function createHealthMonitor(): HealthMonitor {
  return new HealthMonitor();
}

export interface BootOptions {
  token: string;
  client: Client;
  onReady?: () => Promise<void>;
}

export async function boot(options: BootOptions): Promise<void> {
  const { token, client, onReady } = options;

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    if (onReady) await onReady();
  });

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  await client.login(token);
}

export async function shutdown(client: Client): Promise<void> {
  console.log("Shutting down...");
  await client.destroy();
  console.log("Shutdown complete");
}