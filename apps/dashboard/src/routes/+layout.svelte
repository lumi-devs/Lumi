<script lang="ts">
  import "../app.css";
  let { data, children } = $props();
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">L</span>
      <span>Lumi Dashboard</span>
    </a>
    <span class="topbar-spacer"></span>
    {#if data.user}
      <span class="user-chip">
        {#if data.user.avatarUrl}
          <img
            class="avatar"
            src={data.user.avatarUrl}
            alt=""
            width="28"
            height="28"
          />
        {/if}
        <span>{data.user.displayName ?? data.user.username}</span>
      </span>
      <form method="POST" action="/auth/logout">
        <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
        <button class="secondary small" type="submit">Sign out</button>
      </form>
    {:else}
      <a class="button small" href="/auth/login">Sign in with Discord</a>
    {/if}
  </div>
</header>

<main id="main">
  {@render children()}
</main>
