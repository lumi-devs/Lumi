import { redirect } from "next/navigation";

// Superseded by /guilds - kept as a redirect rather than deleted outright in
// case anything still has this path bookmarked or linked.
export default function GuildPickerPage() {
  redirect("/guilds");
}
