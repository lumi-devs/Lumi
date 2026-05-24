import { ApplyOptions } from "@sapphire/decorators";
import { Route, type ApiRequest, type ApiResponse } from "@sapphire/plugin-api";

@ApplyOptions<Route.Options>({
  route: "health",
})
export class HealthRoute extends Route {
  public override run(request: ApiRequest, response: ApiResponse) {
    if (request.method !== "GET") {
      return response.status(405).json({ error: "Method Not Allowed" });
    }

    return response.json({
      status: "ok",
      message: "Ember API is alive and running!",
      timestamp: Date.now(),
    });
  }
}
