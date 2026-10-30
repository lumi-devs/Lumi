# Role Menus

Module: `role-menus` (supermodule) with submodule `role-menus-menu` in
`modules/role-menus/menu/`.

Role menus let members claim roles for themselves from a posted message.
Staff create a group, attach roles, choose a selection mode, and publish the
group as buttons, a string select, or reactions.

## Configuration

Stored per guild under the `roleMenus` key (the supermodule manifest sets
`configKey`). Settings are edited from `/lumi` -> Modules -> Role Menus ->
Module Settings.

| Key                          | Type   | Default    | Purpose                                      |
| ---------------------------- | ------ | ---------- | -------------------------------------------- |
| `defaultMode`                | select | `multiple` | Mode for newly created groups                |
| `defaultRequireOne`          | bool   | `false`    | Require at least one menu role by default    |
| `defaultAutoToggle`          | bool   | `true`     | Toggle held roles off by default             |
| `defaultMaxSelections`       | number | `0`        | Default cap; `0` means unlimited             |
| `defaultTempDurationSeconds` | number | `0`        | Default temporary duration; `0` is permanent |
| `maxOptionsPerGroup`         | number | `25`       | Upper bound for roles in one group           |

The submodule is enabled per guild. Disabling it stops `/rolemenu`, menu
components, and reaction handling for that guild. Expired temporary roles are
still swept after the submodule or supermodule is disabled so roles do not leak.

## Commands

All subcommands live under `/rolemenu`. Every subcommand requires **Manage
Server** or the `rolemenu.manage` permit.

| Command                   | Behavior                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/rolemenu create`        | Create a group with name, description, mode, require-one, auto-toggle, max selections, and temporary duration |
| `/rolemenu edit`          | Change a group's name, description, or selection settings                                                     |
| `/rolemenu delete`        | Delete a group, its posted messages, options, and temporary-role records                                      |
| `/rolemenu add-option`    | Add a role with an optional label, emoji, and description                                                     |
| `/rolemenu remove-option` | Remove a role from a group                                                                                    |
| `/rolemenu post`          | Publish a group as buttons, a select menu, or reactions                                                       |
| `/rolemenu list`          | List groups with mode, option count, and temporary settings                                                   |
| `/rolemenu refresh`       | Re-render a group's posted messages and reconcile reaction menus                                              |

Group options support autocomplete. Temporary durations are expressed in
seconds and are capped at 30 days (`2,592,000`). A max selection of `0` and a
temporary duration of `0` mean unlimited and permanent respectively.

## Selection Behavior

- `single` mode keeps at most one role from the group. Selecting a different
  role swaps the old role out.
- `multiple` mode allows any number of roles up to `maxSelections`.
- `autoToggle` removes a role when a member selects it again.
- `requireOne` rejects a removal that would leave the member with zero roles
  from the group.
- Max-selection violations are rejected as a whole; no partial role changes are
  applied.
- Buttons and selects reply with ephemeral Components V2 cards. Reaction menus
  send failures by direct message because reactions cannot reply ephemerally.
- Role grants and removals check bot **Manage Roles**, role position, managed
  roles, the server owner, and member hierarchy before changing anything.

## Menu Styles

- **Buttons**: Components V2 card with up to 25 buttons across five action rows.
- **Select**: Components V2 card with one string select holding up to 25 options.
- **Reactions**: plain Components V2 card plus bot reactions. Custom option
  emojis are used when unique; fallback number/letter emojis are assigned
  deterministically. Reaction menus support up to 20 options.

Custom IDs are prefixed with `lumi:rolemenu` and include the group ID. Button
IDs also include the option ID.

## Temporary Roles

When a group has `tempDurationSeconds`, every successful add records a row in
`role_menu_temp_roles` with an expiry. Re-selecting a held temporary role
extends its expiry. Removing the role or removing the option clears its record.

A `*/1 * * * *` task claims expired rows by deleting them conditionally, then
removes the role from the member. Missing guilds, members, roles, or permission
errors are logged and the row stays cleaned up so the sweep cannot loop forever.

## Database Tables

- `role_menu_groups` (`RoleMenuGroup`) - guild, name, description, mode,
  `require_one`, `auto_toggle`, `max_selections`, `temp_duration_seconds`
- `role_menu_options` (`RoleMenuOption`) - group, role, label, emoji,
  description, position
- `role_menu_messages` (`RoleMenuMessage`) - guild, group, channel, message,
  style (`buttons`, `select`, `reactions`)
- `role_menu_temp_roles` (`RoleMenuTempRole`) - guild, user, role, expiry

Deleting a group cascades its options and message records. Deleting or removing
an option also removes temporary-role tracking for that role.

## Permissions

- Authoring: **Manage Server**, **Administrator**, or `rolemenu.manage`
  (including `*` and `admin.*` grants).
- Members do not need a permit to use posted menus; they can only change roles
  that the menu exposes.
- The bot needs **Manage Roles** with a role above every menu role it assigns.
- `/lumi` permission checks still apply to module settings.
