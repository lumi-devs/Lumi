<script lang="ts">
  import ConfigFieldInput from "$lib/components/ConfigFieldInput.svelte";
  let { data } = $props();
</script>

<p><a href="/guilds/{data.guild.id}/modules">← Back to modules</a></p>

<div class="page-hero">
  <div>
    <h2 style="margin-bottom:0.2rem">
      {data.module.emoji}
      {data.module.displayName}
    </h2>
    <p class="muted" style="margin:0">
      {data.module.description || "No description"} · v{data.module.version} · config
      key <code>{data.module.configKey}</code>
    </p>
  </div>
</div>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

<div class="panel">
  <h3>Configuration</h3>
  {#if data.module.configFields.length === 0}
    <p class="muted">
      This module does not declare configuration fields. Its settings are
      managed by the bot or by its own commands.
    </p>
  {:else}
    <form method="POST" action="?/save">
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <div class="form-grid">
        {#each data.module.configFields as field (field.key)}
          <ConfigFieldInput {field} value={data.config[field.key]} />
        {/each}
      </div>
      <div class="actions" style="margin-top:1rem">
        <button type="submit">Save configuration</button>
      </div>
    </form>
  {/if}
</div>

<div class="panel">
  <h3>Reset configuration</h3>
  <p class="muted">
    Removes the stored <code>{data.module.configKey}</code> settings object. The module
    falls back to its declared defaults.
  </p>
  <form method="POST" action="?/reset">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <button class="danger" type="submit">Reset settings</button>
  </form>
</div>
