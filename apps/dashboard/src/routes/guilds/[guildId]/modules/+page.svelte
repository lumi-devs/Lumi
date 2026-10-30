<script lang="ts">
  let { data } = $props();
</script>

<h2>Feature modules</h2>
<p class="muted">
  Modules are discovered from their manifests. Disabled modules keep their
  configuration; their commands and listeners do not run.
</p>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

<div class="panel">
  {#if data.modules.length === 0}
    <p class="muted">No modules were found on the server filesystem.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Module</th>
            <th>State</th>
            <th>Source</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each data.modules as module (module.name)}
            <tr>
              <td>
                <strong>{module.emoji} {module.displayName}</strong>
                <div class="muted">
                  {module.description || "No description"} · v{module.version}
                  · <code>{module.name}</code>
                </div>
              </td>
              <td>
                <span class="badge {module.enabled ? 'on' : 'off'}"
                  >{module.enabled ? "Enabled" : "Disabled"}</span
                >
              </td>
              <td><span class="badge">{module.source}</span></td>
              <td>
                <div class="actions">
                  {#if module.configFields.length > 0 || module.configKey}
                    <a
                      class="button secondary small"
                      href="/guilds/{data.guild.id}/modules/{module.name}"
                      >Configure</a
                    >
                  {/if}
                  <form method="POST" action="?/toggle">
                    <input
                      type="hidden"
                      name="_csrf"
                      value={data.csrfToken ?? ""}
                    />
                    <input type="hidden" name="module" value={module.name} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={module.enabled ? "false" : "true"}
                    />
                    <button
                      class={module.enabled ? "danger small" : "small"}
                      type="submit"
                    >
                      {module.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if data.unknownModules.length > 0}
  <div class="panel">
    <h2>Other database modules</h2>
    <p class="muted">
      These rows exist in <code>guild_modules</code> but no manifest was found.
    </p>
    <ul>
      {#each data.unknownModules as module (module.name)}
        <li>
          <code>{module.name}</code> —
          {module.enabled ? "enabled" : "disabled"}
        </li>
      {/each}
    </ul>
  </div>
{/if}
