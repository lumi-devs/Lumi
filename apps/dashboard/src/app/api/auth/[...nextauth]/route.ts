import { handlers } from "#/lib/auth";

// NextAuth's catch-all route — handles /api/auth/signin, /callback/discord,
// /session, /signout, /csrf, etc. Replaces the old hand-rolled /login,
// /callback, /logout routes in apps/dashboard/src/server.ts.
export const { GET, POST } = handlers;
