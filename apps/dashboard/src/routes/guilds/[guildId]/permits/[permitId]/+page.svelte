<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();

  function jsonValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }

  function localDate(value: string | null): string {
    return value ? value.slice(0, 16) : "";
  }
</script>

<p><a href="/guilds/{data.guild.id}/permits">← Back to permits</a></p>

<div class="page-hero">
  <div>
    <h2 style="margin-bottom:0.2rem">
      Permit #{data.permit.number} · {data.permit.name}
    </h2>
    <p class="muted" style="margin:0">
      {data.permit.polarity} · position {data.permit.position} · updated
      {formatDate(data.permit.updatedAt)}
      {#if data.permit.builtin}<span class="badge">built-in</span>{/if}
    </p>
  </div>
</div>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

{#if data.permit.builtin}
  <div class="notice warn">
    This is a built-in permit. Its definition cannot be edited or deleted from
    the dashboard, but assignments can still be managed.
  </div>
{/if}

<div class="panel">
  <h3>Definition</h3>
  <form method="POST" action="?/update">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <fieldset
      disabled={data.permit.builtin}
      style="border:0;padding:0;margin:0"
    >
      <div class="form-grid">
        <div class="field">
          <label for="p-name">Name</label>
          <input
            id="p-name"
            name="name"
            type="text"
            maxlength="64"
            value={data.permit.name}
            required
          />
        </div>
        <div class="field">
          <label for="p-polarity">Polarity</label>
          <select id="p-polarity" name="polarity">
            <option value="Grant" selected={data.permit.polarity === "Grant"}
              >Grant</option
            >
            <option value="Deny" selected={data.permit.polarity === "Deny"}
              >Deny</option
            >
          </select>
        </div>
        <div class="field">
          <label for="p-position">Position</label>
          <input
            id="p-position"
            name="position"
            type="number"
            min="0"
            value={data.permit.position}
          />
        </div>
        <div class="field">
          <label for="p-expires">Expires at (optional)</label>
          <input
            id="p-expires"
            name="expiresAt"
            type="datetime-local"
            value={localDate(data.permit.expiresAt)}
          />
        </div>
        <div class="field">
          <label for="p-timezone">Timezone (optional)</label>
          <input
            id="p-timezone"
            name="timezone"
            type="text"
            maxlength="64"
            value={data.permit.timezone ?? ""}
          />
        </div>
        <div class="field full">
          <label for="p-nodes">Nodes</label>
          <textarea id="p-nodes" name="nodes" required
            >{data.permit.nodes.join("\n")}</textarea
          >
        </div>
        <div class="field full">
          <label for="p-scopes">Whitelist scopes (optional)</label>
          <textarea id="p-scopes" name="whitelistScopes"
            >{data.permit.whitelistScopes.join("\n")}</textarea
          >
        </div>
        <div class="field full">
          <label for="p-schedule">Schedule JSON (optional)</label>
          <textarea id="p-schedule" name="schedule" spellcheck="false"
            >{jsonValue(data.permit.schedule)}</textarea
          >
        </div>
        <div class="field full">
          <label for="p-conditions">Conditions JSON (optional)</label>
          <textarea id="p-conditions" name="conditions" spellcheck="false"
            >{jsonValue(data.permit.conditions)}</textarea
          >
        </div>
      </div>
      {#if !data.permit.builtin}
        <div class="actions" style="margin-top:1rem">
          <button type="submit">Save changes</button>
        </div>
      {/if}
    </fieldset>
  </form>
  {#if !data.permit.builtin}
    <form method="POST" action="?/delete" style="margin-top:0.8rem">
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <button class="danger" type="submit">Delete permit</button>
    </form>
  {/if}
</div>

<div class="panel">
  <h3>Assignments</h3>
  {#if data.permit.assignments.length === 0}
    <p class="muted">No targets assigned to this permit.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Target</th>
            <th>Granted by</th>
            <th>Granted</th>
            <th>Expires</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.permit.assignments as assignment (assignment.id)}
            <tr>
              <td><span class="badge">{assignment.targetType}</span></td>
              <td><code>{assignment.targetId}</code></td>
              <td>{assignment.grantedBy}</td>
              <td>{formatDate(assignment.grantedAt)}</td>
              <td
                >{assignment.expiresAt
                  ? formatDate(assignment.expiresAt)
                  : "Never"}</td
              >
              <td>
                <form method="POST" action="?/unassign">
                  <input
                    type="hidden"
                    name="_csrf"
                    value={data.csrfToken ?? ""}
                  />
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={assignment.id}
                  />
                  <button class="secondary small" type="submit">Remove</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <h3 style="margin-top:1.2rem">Assign a target</h3>
  <form method="POST" action="?/assign">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label for="a-type">Target type</label>
        <select id="a-type" name="targetType">
          <option value="USER">User</option>
          <option value="ROLE">Role</option>
          <option value="CHANNEL">Channel</option>
        </select>
      </div>
      <div class="field">
        <label for="a-id">Target ID</label>
        <input
          id="a-id"
          name="targetId"
          type="text"
          inputmode="numeric"
          required
        />
      </div>
      <div class="field">
        <label for="a-expires">Expires at (optional)</label>
        <input id="a-expires" name="expiresAt" type="datetime-local" />
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Assign</button>
    </div>
  </form>
</div>
