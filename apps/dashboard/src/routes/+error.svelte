<script lang="ts">
  import { page } from "$app/stores";
</script>

<div class="login-wrap">
  <div class="panel">
    <p class="badge warn">{String($page.status)}</p>
    <h1>{$page.status === 403 ? "Access denied" : "Something went wrong"}</h1>
    <p>{$page.error?.message ?? "An unexpected error occurred."}</p>
    <div class="actions">
      <a class="button" href="/guilds">Back to servers</a>
      <a class="button secondary" href="/">Home</a>
    </div>
  </div>
</div>
