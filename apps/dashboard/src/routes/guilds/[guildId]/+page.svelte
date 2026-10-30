<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

{#if !data.botPresent}
  <div class="notice warn" role="status">
    The bot is not currently a member of this server, or <code>BOT_TOKEN</code>
    cannot see it. Dashboard edits are saved, but bot actions will not run.
  </div>
{/if}

<div class="grid" style="margin-bottom:1rem">
  <div class="stat">
    <strong>{data.modules.enabled}/{data.modules.available}</strong>
    <span>Modules enabled</span>
  </div>
  <div class="stat">
    <strong>{data.permitCount}</strong>
    <span>Permits configured</span>
  </div>
  <div class="stat">
    <strong>{data.openTickets}</strong>
    <span>Open tickets</span>
  </div>
  <div class="stat">
    <strong>{data.memberCount ?? "—"}</strong>
    <span>Members (latest snapshot)</span>
  </div>
</div>

<div class="panel">
  <h2>Quick actions</h2>
  <div class="actions">
    <a class="button" href="/guilds/{data.guild.id}/modules">Modules</a>
    <a class="button secondary" href="/guilds/{data.guild.id}/permits"
      >Permits</a
    >
    <a class="button secondary" href="/guilds/{data.guild.id}/security"
      >Security</a
    >
    <a class="button secondary" href="/guilds/{data.guild.id}/features"
      >Features</a
    >
  </div>
</div>

<div class="panel">
  <h2>Recent audit activity</h2>
  {#if data.recentAudit.length === 0}
    <p class="muted">No audit entries recorded for this server yet.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Action</th><th>User</th><th>Target</th><th>When</th></tr>
        </thead>
        <tbody>
          {#each data.recentAudit as entry (entry.id)}
            <tr>
              <td><code>{entry.action}</code></td>
              <td>{entry.userId}</td>
              <td>{entry.targetId ?? "—"}</td>
              <td>{formatDate(entry.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  <p style="margin-top:0.8rem">
    <a href="/guilds/{data.guild.id}/cases">View all cases and audit logs</a>
  </p>
</div>

<div class="panel">
  <h2>Backups</h2>
  {#if data.latestBackup}
    <p>
      Latest backup <code>{data.latestBackup.id}</code> ({data.latestBackup
        .reason}) created {formatDate(data.latestBackup.createdAt)}.
    </p>
  {:else}
    <p class="muted">No security backups stored yet.</p>
  {/if}
  <a class="button secondary" href="/guilds/{data.guild.id}/security"
    >Security controls</a
  >
</div>
