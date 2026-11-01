<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();

  type Entry = (typeof data.entries)[number];

  let selected = $state<Entry | null>(null);
  let copied = $state<string | null>(null);

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
    if (data.filters.q) params.set("q", data.filters.q);
    if (data.filters.userId) params.set("userId", data.filters.userId);
    if (data.filters.targetId) params.set("targetId", data.filters.targetId);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `?${query}` : "?";
  }

  async function copy(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      copied = label;
      setTimeout(() => {
        if (copied === label) copied = null;
      }, 2000);
    } catch {
      copied = "Could not copy to clipboard";
    }
  }

  function runAction(value: string, entry: Entry): void {
    if (!value) return;
    if (value === "view") selected = entry;
    else if (value === "copy-case")
      void copy(String(entry.id), "Case ID copied");
    else if (value === "copy-user") void copy(entry.userId, "User ID copied");
    else if (value === "copy-target" && entry.targetId)
      void copy(entry.targetId, "Target ID copied");
  }
</script>

<h2>Cases & audit log</h2>
<p class="muted">
  Read-only view of <code>audit_logs</code>, including moderation cases and
  dashboard changes.
</p>

{#if copied}
  <div class="notice ok" role="status">{copied}</div>
{/if}

<div class="panel">
  <form method="GET" action="?">
    <div class="form-grid">
      <div class="field">
        <label for="f-action">Action</label>
        <select id="f-action" name="action">
          <option value="">All actions</option>
          {#each data.actions as action (action)}
            <option value={action} selected={data.filters.action === action}>
              {action}
            </option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="f-q">Action contains (optional)</label>
        <input
          id="f-q"
          name="q"
          type="text"
          maxlength="100"
          value={data.filters.q}
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

{#if selected}
  <div class="panel">
    <div class="panel-heading">
      <h3>Case #{selected.id} details</h3>
      <button
        class="secondary small"
        type="button"
        onclick={() => (selected = null)}
      >
        Close
      </button>
    </div>
    <dl class="detail-list">
      <dt>Action</dt>
      <dd><code>{selected.action}</code></dd>
      <dt>When</dt>
      <dd>{formatDate(selected.createdAt)}</dd>
      <dt>User</dt>
      <dd><code>{selected.userId}</code></dd>
      <dt>Target</dt>
      <dd>
        {#if selected.targetId}
          <code>{selected.targetId}</code>
          {#if selected.targetType}
            <span class="muted">({selected.targetType})</span>
          {/if}
        {:else}
          —
        {/if}
      </dd>
      <dt>Changes</dt>
      <dd>
        {#if selected.changes}
          <pre>{changesText(selected.changes)}</pre>
        {:else}
          —
        {/if}
      </dd>
    </dl>
  </div>
{/if}

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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.entries as entry (entry.id)}
            <tr>
              <td>{formatDate(entry.createdAt)}</td>
              <td><span class="badge">{entry.action}</span></td>
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
              <td>
                <select
                  class="row-actions"
                  aria-label="Case actions"
                  onchange={(event) => {
                    const select = event.currentTarget;
                    runAction(select.value, entry);
                    select.value = "";
                  }}
                >
                  <option value="">Actions</option>
                  <option value="view">View details</option>
                  <option value="copy-case">Copy case ID</option>
                  <option value="copy-user">Copy user ID</option>
                  {#if entry.targetId}
                    <option value="copy-target">Copy target ID</option>
                  {/if}
                </select>
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

<style>
  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .detail-list {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.4rem 1rem;
    margin: 0;
  }

  .detail-list dt {
    color: var(--muted);
    font-weight: 600;
  }

  .detail-list dd {
    margin: 0;
    min-width: 0;
  }

  .detail-list pre {
    margin: 0;
    max-height: 320px;
  }

  .row-actions {
    width: auto;
    min-width: 110px;
  }
</style>
