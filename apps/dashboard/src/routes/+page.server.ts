import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.session) throw redirect(303, "/guilds");
  return {
    error: url.searchParams.get("error"),
  };
};
