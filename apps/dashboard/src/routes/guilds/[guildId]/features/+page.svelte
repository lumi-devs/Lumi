<script lang="ts">
  import { formatDate } from "#lib/format.js";
  import ConfirmForm from "#lib/components/ConfirmForm.svelte";
  import NodePicker from "#lib/components/NodePicker.svelte";
  let { data, form } = $props();

  function lines(value: unknown): string {
    return Array.isArray(value) ? value.join("\n") : "";
  }

  function questionsText(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) return "";
    if (value.every((entry) => typeof entry === "string")) {
      return value.join("\n");
    }
    return JSON.stringify(value, null, 2);
  }
</script>

{#snippet commandForm(command: any)}
  {@const uid = `cmd-${command?.id ?? "new"}`}
  <form method="POST" action="?/saveCommand">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    {#if command}<input type="hidden" name="id" value={command.id} />{/if}
    <div class="form-grid">
      <div class="field">
        <label for="{uid}-name">Name</label>
        <input
          id="{uid}-name"
          name="name"
          type="text"
          maxlength="64"
          value={command?.name ?? ""}
          required
        />
      </div>
      <div class="field">
        <label for="{uid}-trigger-type">Trigger type</label>
        <select id="{uid}-trigger-type" name="triggerType">
          {#each ["exact", "contains", "starts_with", "regex"] as type (type)}
            <option
              value={type}
              selected={(command?.triggerType ?? "exact") === type}
              >{type}</option
            >
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="{uid}-trigger">Trigger</label>
        <input
          id="{uid}-trigger"
          name="trigger"
          type="text"
          maxlength="500"
          value={command?.trigger ?? ""}
          required
        />
      </div>
      <div class="field">
        <label for="{uid}-cooldown">Cooldown (seconds)</label>
        <input
          id="{uid}-cooldown"
          name="cooldownSeconds"
          type="number"
          min="0"
          max="86400"
          value={command?.cooldownSeconds ?? 0}
        />
      </div>
      <div class="field">
        <label for="{uid}-group">Group</label>
        <select id="{uid}-group" name="groupId">
          <option value="">No group</option>
          {#each data.commandGroups as group (group.id)}
            <option value={group.id} selected={command?.groupId === group.id}
              >{group.name}</option
            >
          {/each}
        </select>
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="enabled"
            checked={command ? command.enabled : true}
          />
          Enabled
        </label>
      </div>
      <div class="field full">
        <label for="{uid}-description">Description</label>
        <input
          id="{uid}-description"
          name="description"
          type="text"
          maxlength="500"
          value={command?.description ?? ""}
        />
      </div>
      <div class="field full">
        <label for="{uid}-responses">Responses</label>
        <textarea id="{uid}-responses" name="responses" required
          >{lines(command?.responses ?? [])}</textarea
        >
        <span class="hint">One response per line.</span>
      </div>
      <div class="field full">
        <label for="{uid}-permissions">Permission nodes</label>
        <NodePicker
          id="{uid}-permissions"
          name="permissionNodes"
          nodes={data.nodes}
          selected={[...(command?.permissionNodes ?? [])]}
        />
      </div>
    </div>
    <div class="actions" style="margin-top:0.8rem">
      <button type="submit"
        >{command ? "Save command" : "Create command"}</button
      >
    </div>
  </form>
{/snippet}

{#snippet menuForm(menu: any)}
  {@const uid = `menu-${menu?.id ?? "new"}`}
  <form method="POST" action="?/saveMenu">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    {#if menu}<input type="hidden" name="id" value={menu.id} />{/if}
    <div class="form-grid">
      <div class="field">
        <label for="{uid}-name">Name</label>
        <input
          id="{uid}-name"
          name="name"
          type="text"
          maxlength="64"
          value={menu?.name ?? ""}
          required
        />
      </div>
      <div class="field">
        <label for="{uid}-mode">Mode</label>
        <select id="{uid}-mode" name="mode">
          <option
            value="multiple"
            selected={(menu?.mode ?? "multiple") === "multiple"}
            >Multiple</option
          >
          <option value="single" selected={menu?.mode === "single"}
            >Single</option
          >
        </select>
      </div>
      <div class="field">
        <label for="{uid}-max-selections">Max selections (optional)</label>
        <input
          id="{uid}-max-selections"
          name="maxSelections"
          type="number"
          min="1"
          max="50"
          value={menu?.maxSelections ?? ""}
        />
      </div>
      <div class="field">
        <label for="{uid}-temp-duration"
          >Temp role duration (seconds, optional)</label
        >
        <input
          id="{uid}-temp-duration"
          name="tempDurationSeconds"
          type="number"
          min="0"
          max="31536000"
          value={menu?.tempDurationSeconds ?? ""}
        />
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="requireOne"
            checked={Boolean(menu?.requireOne)}
          />
          Require one selection
        </label>
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="autoToggle"
            checked={menu ? Boolean(menu.autoToggle) : true}
          />
          Auto toggle
        </label>
      </div>
      <div class="field full">
        <label for="{uid}-description">Description</label>
        <input
          id="{uid}-description"
          name="description"
          type="text"
          maxlength="500"
          value={menu?.description ?? ""}
        />
      </div>
    </div>
    <div class="actions" style="margin-top:0.8rem">
      <button type="submit">{menu ? "Save menu" : "Create menu"}</button>
    </div>
  </form>
{/snippet}

{#snippet categoryForm(category: any)}
  {@const uid = `category-${category?.id ?? "new"}`}
  <form method="POST" action="?/saveCategory">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    {#if category}<input type="hidden" name="id" value={category.id} />{/if}
    <div class="form-grid">
      <div class="field">
        <label for="{uid}-name">Name</label>
        <input
          id="{uid}-name"
          name="name"
          type="text"
          maxlength="64"
          value={category?.name ?? ""}
          required
        />
      </div>
      <div class="field">
        <label for="{uid}-emoji">Emoji</label>
        <input
          id="{uid}-emoji"
          name="emoji"
          type="text"
          maxlength="32"
          value={category?.emoji ?? ""}
        />
      </div>
      <div class="field">
        <label for="{uid}-naming-template">Naming template</label>
        <input
          id="{uid}-naming-template"
          name="namingTemplate"
          type="text"
          maxlength="100"
          value={category?.namingTemplate ?? "ticket-{user}"}
        />
      </div>
      <div class="field">
        <label for="{uid}-priority">Default priority</label>
        <select id="{uid}-priority" name="defaultPriority">
          {#each ["low", "normal", "high", "urgent"] as priority (priority)}
            <option
              value={priority}
              selected={(category?.defaultPriority ?? "normal") === priority}
              >{priority}</option
            >
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="{uid}-position">Position</label>
        <input
          id="{uid}-position"
          name="position"
          type="number"
          min="0"
          max="10000"
          value={category?.position ?? 0}
        />
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="enabled"
            checked={category ? category.enabled : true}
          />
          Enabled
        </label>
      </div>
      <div class="field full">
        <label for="{uid}-description">Description</label>
        <input
          id="{uid}-description"
          name="description"
          type="text"
          maxlength="500"
          value={category?.description ?? ""}
        />
      </div>
      <div class="field">
        <label for="{uid}-staff-roles">Staff role IDs</label>
        <textarea id="{uid}-staff-roles" name="staffRoleIds"
          >{lines(category?.staffRoleIds ?? [])}</textarea
        >
      </div>
      <div class="field">
        <label for="{uid}-ping-roles">Ping role IDs</label>
        <textarea id="{uid}-ping-roles" name="pingRoleIds"
          >{lines(category?.pingRoleIds ?? [])}</textarea
        >
      </div>
      <div class="field">
        <label for="{uid}-required-roles">Required role IDs</label>
        <textarea id="{uid}-required-roles" name="requiredRoleIds"
          >{lines(category?.requiredRoleIds ?? [])}</textarea
        >
        <span class="hint"
          >Roles a member needs before opening this category.</span
        >
      </div>
      <div class="field full">
        <label for="{uid}-opening-message">Opening message</label>
        <textarea
          id="{uid}-opening-message"
          name="openingMessage"
          maxlength="2000">{category?.openingMessage ?? ""}</textarea
        >
        <span class="hint"
          >Shown at the top of every new ticket in this category.</span
        >
      </div>
      <div class="field">
        <label for="{uid}-cooldown">Cooldown (seconds)</label>
        <input
          id="{uid}-cooldown"
          name="cooldownSeconds"
          type="number"
          min="0"
          max="86400"
          value={category?.cooldownSeconds ?? 0}
        />
      </div>
      <div class="field">
        <label for="{uid}-member-limit">Per-user open limit</label>
        <input
          id="{uid}-member-limit"
          name="memberLimit"
          type="number"
          min="0"
          max="25"
          value={category?.memberLimit ?? 0}
        />
        <span class="hint">0 uses the guild-wide limit only.</span>
      </div>
      <div class="field">
        <label for="{uid}-total-limit">Category open limit</label>
        <input
          id="{uid}-total-limit"
          name="totalLimit"
          type="number"
          min="0"
          max="500"
          value={category?.totalLimit ?? 0}
        />
        <span class="hint"
          >0 means unlimited open tickets in this category.</span
        >
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="claimingEnabled"
            checked={category ? category.claimingEnabled : true}
          />
          Claiming enabled
        </label>
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="feedbackEnabled"
            checked={category ? category.feedbackEnabled : true}
          />
          Feedback enabled
        </label>
      </div>
      <div class="field full">
        <label for="{uid}-questions">Questions</label>
        <textarea id="{uid}-questions" name="questions"
          >{questionsText(category?.questions ?? [])}</textarea
        >
        <span class="hint"
          >One text question per line, or paste a JSON array for menu questions.</span
        >
      </div>
    </div>
    <div class="actions" style="margin-top:0.8rem">
      <button type="submit"
        >{category ? "Save category" : "Create category"}</button
      >
    </div>
  </form>
{/snippet}

<h2>Feature configuration</h2>
<p class="muted">
  Configure custom commands, role menus, and ticket categories stored in the
  database. Discord message panels are still sent by the bot.
</p>

{#if form?.success}
  <div class="notice ok" role="status">{form.success}</div>
{/if}
{#if form?.error}
  <div class="notice error" role="alert">{form.error}</div>
{/if}

<div class="panel">
  <h3>Custom commands</h3>
  {#if data.commands.length === 0}
    <p class="muted">No custom commands yet.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Trigger</th><th>State</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.commands as command (command.id)}
            <tr>
              <td><strong>{command.name}</strong></td>
              <td><code>{command.triggerType}: {command.trigger}</code></td>
              <td>
                <span class="badge {command.enabled ? 'on' : 'off'}"
                  >{command.enabled ? "Enabled" : "Disabled"}</span
                >
              </td>
              <td>
                <div class="actions">
                  <ConfirmForm
                    action="?/deleteCommand"
                    csrfToken={data.csrfToken ?? ""}
                    buttonLabel="Delete"
                    confirmLabel="Confirm"
                    message="Delete this custom command?"
                    hidden={[{ name: "id", value: command.id }]}
                    small
                  />
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="4">
                <details>
                  <summary>Edit {command.name}</summary>
                  {@render commandForm(command)}
                </details>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <details style="margin-top:1rem">
    <summary><strong>Create custom command</strong></summary>
    {@render commandForm(null)}
  </details>
</div>

<div class="panel">
  <h3>Role menus</h3>
  {#if data.menus.length === 0}
    <p class="muted">No role menus yet.</p>
  {:else}
    {#each data.menus as menu (menu.id)}
      <div class="panel" style="box-shadow:none">
        <div class="actions" style="justify-content:space-between">
          <div>
            <strong>{menu.name}</strong>
            <span class="badge">{menu.mode}</span>
            <div class="muted">
              {menu.description || "No description"} · {menu.options.length}
              options
            </div>
          </div>
          <ConfirmForm
            action="?/deleteMenu"
            csrfToken={data.csrfToken ?? ""}
            buttonLabel="Delete menu"
            confirmLabel="Confirm"
            message="Delete this role menu and its options?"
            hidden={[{ name: "id", value: menu.id }]}
            small
          />
        </div>

        {#if menu.options.length > 0}
          <div class="table-wrap" style="margin-top:0.6rem">
            <table>
              <thead>
                <tr><th>Role</th><th>Label</th><th>Emoji</th><th></th></tr>
              </thead>
              <tbody>
                {#each menu.options as option (option.id)}
                  <tr>
                    <td><code>{option.roleId}</code></td>
                    <td>{option.label}</td>
                    <td>{option.emoji ?? "—"}</td>
                    <td>
                      <ConfirmForm
                        action="?/deleteOption"
                        csrfToken={data.csrfToken ?? ""}
                        buttonLabel="Remove"
                        confirmLabel="Confirm"
                        message="Remove this role menu option?"
                        hidden={[{ name: "optionId", value: option.id }]}
                        small
                      />
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <details style="margin-top:0.6rem">
          <summary>Add option</summary>
          <form method="POST" action="?/addOption">
            <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
            <input type="hidden" name="groupId" value={menu.id} />
            <div class="form-grid">
              <div class="field">
                <label for="option-{menu.id}-role">Role ID</label>
                <input
                  id="option-{menu.id}-role"
                  name="roleId"
                  type="text"
                  inputmode="numeric"
                  required
                />
              </div>
              <div class="field">
                <label for="option-{menu.id}-label">Label</label>
                <input
                  id="option-{menu.id}-label"
                  name="label"
                  type="text"
                  maxlength="80"
                  required
                />
              </div>
              <div class="field">
                <label for="option-{menu.id}-emoji">Emoji</label>
                <input
                  id="option-{menu.id}-emoji"
                  name="emoji"
                  type="text"
                  maxlength="32"
                />
              </div>
              <div class="field">
                <label for="option-{menu.id}-position">Position</label>
                <input
                  id="option-{menu.id}-position"
                  name="position"
                  type="number"
                  min="0"
                  value="0"
                />
              </div>
              <div class="field full">
                <label for="option-{menu.id}-description">Description</label>
                <input
                  id="option-{menu.id}-description"
                  name="description"
                  type="text"
                  maxlength="200"
                />
              </div>
            </div>
            <div class="actions" style="margin-top:0.8rem">
              <button type="submit">Add option</button>
            </div>
          </form>
        </details>

        <details style="margin-top:0.6rem">
          <summary>Edit menu</summary>
          {@render menuForm(menu)}
        </details>
      </div>
    {/each}
  {/if}
  <details style="margin-top:1rem">
    <summary><strong>Create role menu</strong></summary>
    {@render menuForm(null)}
  </details>
</div>

<div class="panel">
  <h3>Ticket categories</h3>
  {#if data.categories.length === 0}
    <p class="muted">No ticket categories yet.</p>
  {:else}
    {#each data.categories as category (category.id)}
      <div class="panel" style="box-shadow:none">
        <div class="actions" style="justify-content:space-between">
          <div>
            <strong>{category.emoji ?? ""} {category.name}</strong>
            <span class="badge {category.enabled ? 'on' : 'off'}"
              >{category.enabled ? "Enabled" : "Disabled"}</span
            >
            <div class="muted">
              {category.description || "No description"} · priority
              {category.defaultPriority}
            </div>
          </div>
          <ConfirmForm
            action="?/deleteCategory"
            csrfToken={data.csrfToken ?? ""}
            buttonLabel="Delete category"
            confirmLabel="Confirm"
            message="Delete this ticket category?"
            hidden={[{ name: "id", value: category.id }]}
            small
          />
        </div>
        <details style="margin-top:0.6rem">
          <summary>Edit category</summary>
          {@render categoryForm(category)}
        </details>
      </div>
    {/each}
  {/if}
  <details style="margin-top:1rem">
    <summary><strong>Create ticket category</strong></summary>
    {@render categoryForm(null)}
  </details>
</div>

<div class="panel">
  <h3>Ticket panels</h3>
  {#if data.panels.length === 0}
    <p class="muted">No ticket panel records yet.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Title</th><th>Channel</th><th>Categories</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.panels as panel (panel.id)}
            <tr>
              <td>{panel.title}</td>
              <td><code>{panel.channelId}</code></td>
              <td>{panel.categoryIds.length}</td>
              <td>
                <ConfirmForm
                  action="?/deletePanel"
                  csrfToken={data.csrfToken ?? ""}
                  buttonLabel="Delete"
                  confirmLabel="Confirm"
                  message="Delete this ticket panel?"
                  hidden={[{ name: "id", value: panel.id }]}
                  small
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <details style="margin-top:1rem">
    <summary><strong>Create ticket panel record</strong></summary>
    <form method="POST" action="?/savePanel">
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <div class="form-grid">
        <div class="field">
          <label for="panel-new-channel">Channel ID</label>
          <input
            id="panel-new-channel"
            name="channelId"
            type="text"
            inputmode="numeric"
            required
          />
        </div>
        <div class="field">
          <label for="panel-new-title">Title</label>
          <input
            id="panel-new-title"
            name="title"
            type="text"
            maxlength="100"
            required
          />
        </div>
        <div class="field full">
          <label for="panel-new-description">Description</label>
          <textarea
            id="panel-new-description"
            name="description"
            maxlength="1000"></textarea>
        </div>
        <div class="field full">
          <label for="panel-new-categories">Category IDs</label>
          <textarea id="panel-new-categories" name="categoryIds"></textarea>
          <span class="hint">One category ID per line.</span>
        </div>
      </div>
      <div class="actions" style="margin-top:0.8rem">
        <button type="submit">Create panel record</button>
      </div>
    </form>
  </details>
</div>

<div class="panel">
  <h3>Recent tickets</h3>
  {#if data.tickets.length === 0}
    <p class="muted">No tickets recorded.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>User</th>
            <th>Category</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {#each data.tickets as ticket (ticket.id)}
            <tr>
              <td><code>{ticket.channelId}</code></td>
              <td><code>{ticket.userId}</code></td>
              <td>{ticket.categoryName ?? "—"}</td>
              <td><span class="badge">{ticket.status}</span></td>
              <td>{ticket.priority}</td>
              <td>{formatDate(ticket.lastActivityAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
