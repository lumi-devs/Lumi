<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();

  function changesText(value: unknown): string {
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function pageHref(page: number): string {
    const params = new URLSearchParams();
    if (data.filters.action) params.set("action", data.filters.action);
    if (data.filters.userId) params.set("userId", data.filters.userId);
    if (data.filters.targetId) params.set("targetId", data.filters.targetId);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `?${query}` : "?";
  }
</script>

<h2>Cases & audit log</h2>
<p class="muted">
  Read-only view of <code>audit_logs</code>, including moderation cases and
  dashboard changes.
</p>

<div class="panel">
  <form method="GET" action="?">
    <div class="form-grid">
      <div class="field">
        <label for="f-action">Action contains</label>
        <input
          id="f-action"
          name="action"
          type="text"
          maxlength="100"
          value={data.filters.action}
          placeholder="mod.ban"
        />
      </div>
      <div class="field">
        <label for="f-user">User ID</label>
        <input
          id="f-user"
          name="userId"
          type="text"
          inputmode="numeric"
          value={data.filters.userId}
          placeholder="123456789012345678"
        />
      </div>
      <div class="field">
        <label for="f-target">Target ID</label>
        <input
          id="f-target"
          name="targetId"
          type="text"
          inputmode="numeric"
          value={data.filters.targetId}
        />
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Apply filters</button>
      <a class="button secondary" href="?">Clear</a>
    </div>
  </form>
</div>

<div class="panel">
  <p class="muted">
    {data.total} entries · page {data.page} of {data.totalPages}
  </p>
  {#if data.entries.length === 0}
    <p>No audit entries match these filters.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>User</th>
            <th>Target</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as entry (entry.id)}
            <tr>
              <td>{formatDate(entry.createdAt)}</td>
              <td><code>{entry.action}</code></td>
              <td><code>{entry.userId}</code></td>
              <td>
                {#if entry.targetId}
                  <code>{entry.targetId}</code>
                  {#if entry.targetType}<div class="muted">
                      {entry.targetType}
                    </div>{/if}
                {:else}
                  —
                {/if}
              </td>
              <td>
                {#if entry.changes}
                  <details>
                    <summary>View</summary>
                    <pre>{changesText(entry.changes)}</pre>
                  </details>
                {:else}
                  —
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="pagination">
    <span>{data.total} total</span>
    <span class="actions">
      {#if data.page > 1}
        <a class="button secondary small" href={pageHref(data.page - 1)}
          >Previous</a
        >
      {/if}
      {#if data.page < data.totalPages}
        <a class="button secondary small" href={pageHref(data.page + 1)}>Next</a
        >
      {/if}
    </span>
  </div>
</div>
