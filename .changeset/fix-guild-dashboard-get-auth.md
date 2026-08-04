---
"@lumi/core": patch
---

`guildDashboardGet` RPC handler now re-checks the actor's live Discord permissions (owner or ManageGuild/Administrator) like the other dashboard RPC handlers, closing a gap that let any authenticated dashboard actor read any guild's settings and module configs by guild ID alone.
