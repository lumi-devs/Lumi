import { requireGuild } from "#/lib/auth-guards";
import { env } from "#/lib/env";

// Streamed indefinitely, so force-dynamic keeps Next from ever caching or
// statically evaluating this route, and the Node runtime is required for a
// passthrough `ReadableStream` response body.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  const session = await requireGuild(guildId);

  const upstream = new URL("/events", env.rpcHttpUrl);
  upstream.searchParams.set("guildId", guildId);
  upstream.searchParams.set("actorId", session.userId);

  const upstreamRes = await fetch(upstream, {
    headers: env.rpcInternalToken ? { authorization: `Bearer ${env.rpcInternalToken}` } : {},
    // Ties the upstream apps/api connection's lifetime to this one, so a
    // client tab closing tears down its Redis fan-out registration instead
    // of leaking a connection until `apps/api`'s own idle detection kicks in.
    signal: request.signal,
  });

  if (!upstreamRes.ok || !upstreamRes.body) {
    return new Response("Upstream SSE unavailable", { status: 502 });
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
