<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Lumi Dashboard</title>
</svelte:head>

<div class="login-wrap">
  <div class="panel">
    <p class="badge">Lumi v2</p>
    <h1>Manage your Discord server</h1>
    {#if data.error}
      <div class="notice error" role="alert">{data.error}</div>
    {/if}
    <p class="muted">
      Sign in with Discord to configure modules, permits, security, tickets, and
      add-ons. Only members with <strong>Manage Server</strong> can open a server
      dashboard.
    </p>
    <p>
      <a class="button" href="/auth/login">Sign in with Discord</a>
    </p>
    <p class="hint">
      The dashboard stores a short-lived session in Redis. Your Discord access
      token never reaches the browser.
    </p>
  </div>
</div>
