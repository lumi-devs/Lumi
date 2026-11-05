import { type RequestHandler, redirect } from "@sveltejs/kit";
import { clearSessionCookie, destroySession } from "#lib/server/session.js";
import { safeEqual } from "#lib/server/validation.js";

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
  const session = locals.session;
  const data = await request.formData().catch(() => null);
  const submitted = data?.get("_csrf");

  if (
    session &&
    locals.sessionId &&
    typeof submitted === "string" &&
    safeEqual(submitted, session.csrfToken)
  ) {
    await destroySession(locals.sessionId);
  }

  clearSessionCookie(cookies);
  throw redirect(303, "/");
};
