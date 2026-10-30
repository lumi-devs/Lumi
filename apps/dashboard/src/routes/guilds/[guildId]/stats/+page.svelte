<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

<h2>Stats & metrics</h2>
<p class="muted">
  Read-only server statistics from the bot's snapshots and event buckets.
  Metrics are never edited from the dashboard.
</p>

{#if data.latest}
  <div class="grid" style="margin-bottom:1rem">
    <div class="stat">
      <strong>{data.latest.memberCount}</strong>
      <span>Members</span>
    </div>
    <div class="stat">
      <strong>{data.latest.onlineCount}</strong>
      <span>Online</span>
    </div>
    <div class="stat">
      <strong>{data.latest.voiceCount}</strong>
      <span>In voice</span>
    </div>
    <div class="stat">
      <strong>{data.latest.channelCount}/{data.latest.roleCount}</strong>
      <span>Channels / roles</span>
    </div>
    <div class="stat">
      <strong>{data.messages7d}</strong>
      <span>Messages (7 days)</span>
    </div>
    <div class="stat">
      <strong>{data.voiceMinutes7d}</strong>
      <span>Voice minutes (7 days)</span>
    </div>
    <div class="stat">
      <strong>{data.economy.users}</strong>
      <span>Economy accounts</span>
    </div>
    <div class="stat">
      <strong>{data.levelingUsers}</strong>
      <span>Leveling profiles</span>
    </div>
  </div>
  <p class="hint">
    Latest snapshot: {formatDate(data.latest.capturedAt)} · boosts:
    {data.latest.boostCount} (tier {data.latest.boostTier})
  </p>
{:else}
  <div class="panel">
    <p class="muted">
      No stats snapshots have been captured for this server yet.
    </p>
  </div>
{/if}

<div class="panel">
  <h3>Snapshot history</h3>
  {#if data.snapshots.length === 0}
    <p class="muted">No snapshots.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Captured</th>
            <th>Members</th>
            <th>Online</th>
            <th>Voice</th>
            <th>Channels</th>
            <th>Roles</th>
            <th>Boosts</th>
          </tr>
        </thead>
        <tbody>
          {#each data.snapshots as snapshot (snapshot.id)}
            <tr>
              <td>{formatDate(snapshot.capturedAt)}</td>
              <td>{snapshot.memberCount}</td>
              <td>{snapshot.onlineCount}</td>
              <td>{snapshot.voiceCount}</td>
              <td>{snapshot.channelCount}</td>
              <td>{snapshot.roleCount}</td>
              <td>{snapshot.boostCount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<div class="panel">
  <h3>Events (last 7 days)</h3>
  {#if data.events.length === 0}
    <p class="muted">No stats events recorded in the last week.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Count</th></tr></thead>
        <tbody>
          {#each data.events as event (event.type)}
            <tr><td><code>{event.type}</code></td><td>{event.count}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<div class="panel">
  <h3>Economy totals</h3>
  <div class="grid">
    <div class="stat">
      <strong>{data.economy.balance}</strong>
      <span>Wallet balance</span>
    </div>
    <div class="stat">
      <strong>{data.economy.bank}</strong>
      <span>Bank balance</span>
    </div>
  </div>
</div>
