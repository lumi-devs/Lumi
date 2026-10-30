<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Your servers · Lumi Dashboard</title>
</svelte:head>

<div class="page-hero">
  <div>
    <h1>Your servers</h1>
    <p class="muted">
      Servers where you have Manage Server. The bot must be a member before
      module actions can take effect.
    </p>
  </div>
</div>

{#if data.guilds.length === 0}
  <div class="panel">
    <h2>No manageable servers</h2>
    <p>
      Your Discord account does not have <strong>Manage Server</strong> in any server,
      or the OAuth grant did not include your guild list. Sign in again to refresh
      the list.
    </p>
    <a class="button secondary" href="/auth/login">Sign in again</a>
  </div>
{:else}
  <div class="grid">
    {#each data.guilds as guild (guild.id)}
      <a
        class="panel"
        href="/guilds/{guild.id}"
        style="display:flex;align-items:center;gap:0.85rem;text-decoration:none;color:inherit"
      >
        {#if guild.iconUrl}
          <img
            class="guild-icon"
            src={guild.iconUrl}
            alt=""
            width="56"
            height="56"
          />
        {:else}
          <span class="guild-icon" aria-hidden="true"
            >{guild.name.slice(0, 2).toUpperCase()}</span
          >
        {/if}
        <span>
          <strong style="display:block">{guild.name}</strong>
          <span class="muted"
            >{guild.owner ? "Owner" : "Manage Server"} · {guild.id}</span
          >
        </span>
      </a>
    {/each}
  </div>
{/if}
