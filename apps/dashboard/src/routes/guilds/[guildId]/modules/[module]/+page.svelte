<script lang="ts">
  import { enhance } from "$app/forms";
  import ConfigFieldInput from "$lib/components/ConfigFieldInput.svelte";
  import ConfirmForm from "$lib/components/ConfirmForm.svelte";
  import EscalationInput from "$lib/components/EscalationInput.svelte";
  let { data } = $props();

  const configuredGenerators = $derived(
    new Set(data.tempvc?.generators.map((generator) => generator.channelId)),
  );
  const availableChannels = $derived(
    data.tempvc?.channels.filter(
      (channel) => !configuredGenerators.has(channel.id),
    ) ?? [],
  );
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
{#if data.form?.warning}
  <div class="notice warn" role="status">{data.form.warning}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

{#if data.tempvc}
  <div class="panel">
    <h3>Generator channels</h3>
    <p class="muted">
      Members who join one of these voice channels get their own temporary
      channel. Add an existing voice channel below.
    </p>

    {#if data.tempvc.generators.length === 0}
      <p class="muted">No generators configured yet.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Name template</th>
              <th>User limit</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#each data.tempvc.generators as generator (generator.channelId)}
              <tr>
                <td>
                  {#if generator.name}
                    <strong>#{generator.name}</strong>
                  {:else}
                    <strong>Unknown channel</strong>
                  {/if}
                  <div class="muted"><code>{generator.channelId}</code></div>
                </td>
                <td>{generator.templateName ?? "Server default"}</td>
                <td>{generator.userLimit ?? "Server default"}</td>
                <td>
                  <ConfirmForm
                    action="?/removeGenerator"
                    csrfToken={data.csrfToken ?? ""}
                    buttonLabel="Remove"
                    confirmLabel="Confirm"
                    message="Remove this temp VC generator?"
                    hidden={[{ name: "channelId", value: generator.channelId }]}
                    small
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if availableChannels.length === 0}
      <p class="muted">
        There are no available voice channels to add. Create one in Discord,
        then reload this page.
      </p>
    {:else}
      <form method="POST" action="?/addGenerator">
        <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
        <div class="form-grid">
          <div class="field">
            <label for="generator-channel">Voice channel</label>
            <select id="generator-channel" name="channelId" required>
              {#each availableChannels as channel (channel.id)}
                <option value={channel.id}>#{channel.name}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="generator-template">Name template (optional)</label>
            <input
              id="generator-template"
              name="templateName"
              type="text"
              maxlength="100"
              placeholder="Use the server default"
            />
            <span class="hint"
              >Use <code>{"{user}"}</code> for the member name.</span
            >
          </div>
          <div class="field">
            <label for="generator-limit">User limit (optional)</label>
            <input
              id="generator-limit"
              name="userLimit"
              type="number"
              min="0"
              max="99"
              placeholder="Use the server default"
            />
            <span class="hint">0 means unlimited.</span>
          </div>
        </div>
        <div class="actions" style="margin-top:1rem">
          <button type="submit">Add generator</button>
        </div>
      </form>
    {/if}
  </div>
{/if}

<div class="panel">
  <h3>Configuration</h3>
  {#if data.module.configFields.length === 0}
    <p class="muted">
      This module does not declare configuration fields. Its settings are
      managed by the bot or by its own commands.
    </p>
  {:else}
    <form method="POST" action="?/save" use:enhance>
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <div class="form-grid">
        {#each data.module.configFields as field (field.key)}
          {#if field.type === "escalation"}
            <EscalationInput {field} value={data.config[field.key]} />
          {:else}
            <ConfigFieldInput {field} value={data.config[field.key]} />
          {/if}
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
