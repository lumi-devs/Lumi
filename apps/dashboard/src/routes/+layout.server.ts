import type { LayoutServerLoad } from "./$types";
import { userAvatarUrl } from "$lib/server/discord";

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = locals.session;
  return {
    user: session
      ? {
          id: session.userId,
          username: session.username,
          displayName: session.displayName,
          avatarUrl: userAvatarUrl(session.userId, session.avatar),
        }
      : null,
    csrfToken: session?.csrfToken ?? null,
  };
};
