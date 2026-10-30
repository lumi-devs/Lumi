import type { Handle } from "@sveltejs/kit";
import { readSession, SessionCookie } from "$lib/server/session";

export const handle: Handle = async ({ event, resolve }) => {
  const cookie = event.cookies.get(SessionCookie);

  event.locals.sessionId = null;
  event.locals.session = null;

  if (cookie) {
    try {
      const loaded = await readSession(cookie);
      if (loaded) {
        event.locals.sessionId = loaded.id;
        event.locals.session = loaded.record;
      } else {
        event.cookies.delete(SessionCookie, { path: "/" });
      }
    } catch (error) {
      console.error("[dashboard] could not load session", error);
    }
  }

  const response = await resolve(event);

  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "same-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  response.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://cdn.discordapp.com data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  return response;
};
