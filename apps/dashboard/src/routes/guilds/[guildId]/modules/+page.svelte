<script lang="ts">
  import { enhance } from "$app/forms";
  import ConfirmForm from "#lib/components/ConfirmForm.svelte";
  let { data, form } = $props();

  let enabledOverrides = $state<Record<string, boolean>>({});
  let pendingModules = $state<Record<string, boolean>>({});

  function moduleEnabled(module: { name: string; enabled: boolean }) {
    return enabledOverrides[module.name] ?? module.enabled;
  }

  function enabledCount(modules: Array<{ name: string; enabled: boolean }>) {
    return modules.filter((module) => moduleEnabled(module)).length;
  }
</script>

{#snippet toggleForm(module: any, size: boolean)}
  <form
    method="POST"
    action="?/toggle"
    use:enhance={() => {
      pendingModules[module.name] = true;
      return async ({ result, update }) => {
        if (result.type === "success") {
          enabledOverrides[module.name] = !moduleEnabled(module);
        }
        pendingModules[module.name] = false;
        await update();
      };
    }}
  >
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <input type="hidden" name="module" value={module.name} />
    <input
      type="hidden"
      name="enabled"
      value={moduleEnabled(module) ? "false" : "true"}
    />
    <button
      class={moduleEnabled(module) ? "danger" : ""}
      class:small={size}
      type="submit"
      disabled={pendingModules[module.name]}
    >
      {pendingModules[module.name]
        ? "Saving…"
        : moduleEnabled(module)
          ? "Disable"
          : "Enable"}
    </button>
  </form>
{/snippet}

{#snippet configureLink(module: any, size: boolean)}
  <a
    class="button secondary"
    class:small={size}
    href="/guilds/{data.guild.id}/modules/{module.name}">Configure</a
  >
{/snippet}

<h2>Feature modules</h2>
<p class="muted">
  Modules are grouped by category. Disabled modules keep their configuration;
  their commands and listeners do not run.
</p>

{#if form?.success}
  <div class="notice ok" role="status">{form.success}</div>
{/if}
{#if form?.warning}
  <div class="notice warn" role="status">{form.warning}</div>
{/if}
{#if form?.error}
  <div class="notice error" role="alert">{form.error}</div>
{/if}

{#if data.groups.length === 0}
  <div class="panel">
    <p class="muted">No modules were found on the server filesystem.</p>
  </div>
{:else}
  {#each data.groups as group (group.category)}
    {@const enabledTotal = enabledCount(group.modules)}
    <section class="panel module-group">
      <div class="module-group-head expanded">
        <div>
          <h3 style="margin:0">
            {group.category}
            <span
              class="badge {enabledTotal === group.modules.length &&
              group.modules.length > 0
                ? 'on'
                : 'off'}">{enabledTotal}/{group.modules.length} enabled</span
            >
          </h3>
        </div>
      </div>

      <div class="table-wrap" style="margin-top:0.75rem">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>State</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {#each group.modules as module (module.name)}
              <tr class="module-row">
                <td>
                  <strong>{module.emoji} {module.displayName}</strong>
                  <div class="muted">
                    {module.description || "No description"} · v{module.version}
                    · <code>{module.name}</code>
                  </div>
                </td>
                <td>
                  <span class="badge {moduleEnabled(module) ? 'on' : 'off'}"
                    >{moduleEnabled(module) ? "Enabled" : "Disabled"}</span
                  >
                </td>
                <td>
                  <div class="actions">
                    {@render configureLink(module, true)}
                    {@render toggleForm(module, true)}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}
{/if}

{#if data.unknownModules.length > 0}
  <section class="panel">
    <h3>Stale database entries</h3>
    <p class="muted">
      These rows exist in <code>guild_modules</code> but no matching manifest was
      found. They are ignored by the bot and can be removed safely.
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Module key</th>
            <th>State</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each data.unknownModules as module (module.name)}
            <tr>
              <td><code>{module.name}</code></td>
              <td>
                <span class="badge {module.enabled ? 'on' : 'off'}"
                  >{module.enabled ? "enabled" : "disabled"}</span
                >
              </td>
              <td>
                <ConfirmForm
                  action="?/removeUnknown"
                  csrfToken={data.csrfToken ?? ""}
                  buttonLabel="Remove stale entry"
                  confirmLabel="Confirm"
                  message="Remove this stale module entry?"
                  hidden={[{ name: "module", value: module.name }]}
                  small
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .module-group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .module-group-head.expanded {
    padding-bottom: 0.9rem;
    border-bottom: 1px solid var(--line);
  }

  .module-group-head h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
  }

  .module-group-head p {
    max-width: 90ch;
  }

  .module-row td {
    padding-top: 0.85rem;
    padding-bottom: 0.85rem;
  }

  .module-row td:first-child {
    padding-left: 0;
    padding-right: 1.5rem;
  }

  .module-row td:nth-child(2),
  .module-row td:nth-child(3) {
    width: 1%;
    white-space: nowrap;
  }

  .module-row td:nth-child(2) {
    padding-right: 1.25rem;
  }

  .module-row .actions {
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .module-row strong {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .module-row .muted {
    margin-top: 0.2rem;
  }

  @media (max-width: 900px) {
    .module-row td:nth-child(2),
    .module-row td:nth-child(3) {
      width: auto;
    }

    .module-row .actions {
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }
</style>
