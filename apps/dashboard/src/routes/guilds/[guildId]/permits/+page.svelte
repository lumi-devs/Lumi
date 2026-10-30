<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

<h2>Permits</h2>
<p class="muted">
  Permits grant or deny command nodes. Lower positions run first. Built-in
  permits cannot be deleted from the dashboard.
</p>

{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

<div class="panel">
  <h3>Configured permits</h3>
  {#if data.permits.length === 0}
    <p class="muted">No permits configured yet.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Polarity</th>
            <th>Nodes</th>
            <th>Assignments</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          {#each data.permits as permit (permit.id)}
            <tr>
              <td>{permit.number}</td>
              <td>
                <a href="/guilds/{data.guild.id}/permits/{permit.id}"
                  >{permit.name}</a
                >
                {#if permit.builtin}<span class="badge">built-in</span>{/if}
              </td>
              <td>
                <span class="badge {permit.polarity === 'Deny' ? 'warn' : 'on'}"
                  >{permit.polarity}</span
                >
              </td>
              <td><code>{permit.nodes.join(", ")}</code></td>
              <td>{permit.assignments}</td>
              <td
                >{permit.expiresAt ? formatDate(permit.expiresAt) : "Never"}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<div class="panel">
  <h3>Create permit</h3>
  <form method="POST" action="?/create">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label for="permit-name">Name</label>
        <input
          id="permit-name"
          name="name"
          type="text"
          maxlength="64"
          required
        />
      </div>
      <div class="field">
        <label for="permit-polarity">Polarity</label>
        <select id="permit-polarity" name="polarity">
          <option value="Grant">Grant</option>
          <option value="Deny">Deny</option>
        </select>
      </div>
      <div class="field">
        <label for="permit-position">Position</label>
        <input
          id="permit-position"
          name="position"
          type="number"
          min="0"
          value="0"
        />
      </div>
      <div class="field">
        <label for="permit-expires">Expires at (optional)</label>
        <input id="permit-expires" name="expiresAt" type="datetime-local" />
      </div>
      <div class="field">
        <label for="permit-timezone">Timezone (optional)</label>
        <input
          id="permit-timezone"
          name="timezone"
          type="text"
          maxlength="64"
          placeholder="Europe/London"
        />
      </div>
      <div class="field full">
        <label for="permit-nodes">Nodes</label>
        <textarea
          id="permit-nodes"
          name="nodes"
          required
          placeholder="admin.config&#10;moderation.ban"></textarea>
        <span class="hint">One node per line or comma-separated.</span>
      </div>
      <div class="field full">
        <label for="permit-scopes">Whitelist scopes (optional)</label>
        <textarea
          id="permit-scopes"
          name="whitelistScopes"
          placeholder="role:123456789012345678"></textarea>
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Create permit</button>
    </div>
  </form>
</div>
