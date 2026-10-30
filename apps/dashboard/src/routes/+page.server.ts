import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.session) throw redirect(303, "/guilds");
  return {
    error: url.searchParams.get("error"),
  };
};
