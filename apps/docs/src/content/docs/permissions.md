---
title: "Permissions & Permit Nodes"
description: "Hierarchical permit node system, command gating, and guild permission overrides."
category: "Core Architecture"
---

# Permissions & Permit System

Lumi implements a dot-notation permit system inspired by UNIX permissions and RBAC (Role-Based Access Control).

## Permit Node Hierarchy

Permit nodes are structured hierarchically using dot notation:

```
admin.*                  # Wildcard granting all administrative capabilities
admin.config.read        # Read guild configuration
admin.config.write       # Modify guild configuration
mod.*                    # All moderation actions
mod.ban                  # Issue or revoke guild bans
mod.mute                 # Apply timeouts
mod.warn                 # Issue warnings
utility.tag.create       # Create custom tags
```

The canonical list of registered nodes is defined in `packages/core/src/lib/permissions/permit-nodes.ts`.

---

## Gating Commands

To require a permit on a Sapphire command:

```ts
import { LumiCommand } from "#lib/commands.js";

export class BanCommand extends LumiCommand {
  public constructor(context: LumiCommand.LoaderContext, options: LumiCommand.Options) {
    super(context, {
      ...options,
      name: "ban",
      description: "Ban a user from the server.",
      requiredPermit: "mod.ban",
    });
  }

  public override async chatInputRun(interaction: LumiCommand.ChatInputCommandInteraction) {
    // Execution will only reach here if the user has `mod.ban` or `admin.*`
  }
}
```

---

## Guild Overrides & Autocomplete

1. **Role Overrides**: Guild owners can bind any permit node to specific Discord roles via `/permit grant` or the web dashboard.
2. **Channel Overrides**: Deny or grant specific nodes inside designated channels.
3. **Autocomplete Integration**: Command options accepting permit strings automatically suggest registered nodes using `filterAutocompleteChoices` from `#utilities/autocomplete.js`.
