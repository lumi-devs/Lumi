import { ApplyOptions } from "@sapphire/decorators";
import { Route, type ApiRequest, type ApiResponse } from "@sapphire/plugin-api";
import { container } from "@sapphire/framework";

@ApplyOptions<Route.Options>({
  route: "health",
})
export class HealthRoute extends Route {
  public override async run(request: ApiRequest, response: ApiResponse) {
    if (request.method !== "GET") {
      return response.status(405).json({ error: "Method Not Allowed" });
    }

    const checks = await Promise.allSettled([
      container.prisma.$queryRaw`SELECT 1`,
      container.redis.ping(),
    ]);

    const postgres = checks[0]?.status === "fulfilled";
    const redis = checks[1]?.status === "fulfilled";
    const rabbit = container.rabbit?.connected ?? false;
    const discord = container.client.isReady();

    const ok = postgres && redis;
    const status = ok ? 200 : 503;

    return response.status(status).json({
      status: ok ? "ok" : "degraded",
      timestamp: Date.now(),
      checks: {
        postgres,
        redis,
        rabbitmq: rabbit,
        discord,
      },
    });
  }
}
