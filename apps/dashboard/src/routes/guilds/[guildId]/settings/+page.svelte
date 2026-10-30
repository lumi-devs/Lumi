<script lang="ts">
  let { data } = $props();
</script>

<h2>Server settings</h2>
<p class="muted">
  These values live in <code>Guild.settings</code>. Module-specific settings are
  edited on each module page.
</p>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

<div class="panel">
  <form method="POST" action="?/save">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label for="prefix">Command prefix</label>
        <input
          id="prefix"
          name="prefix"
          type="text"
          maxlength="5"
          value={data.settings.prefix}
          required
        />
        <span class="hint">1–5 characters, no whitespace.</span>
      </div>
      <div class="field">
        <label for="locale">Locale</label>
        <input
          id="locale"
          name="locale"
          type="text"
          maxlength="24"
          value={data.settings.locale}
          placeholder="en-US"
        />
        <span class="hint">Stored for tooling; the bot UI is English only.</span
        >
      </div>
      <div class="field">
        <label for="messageLogChannel">Message log channel</label>
        <input
          id="messageLogChannel"
          name="messageLogChannel"
          type="text"
          inputmode="numeric"
          value={data.settings.logChannels.message ?? ""}
          placeholder="Channel ID"
        />
      </div>
      <div class="field">
        <label for="moderationLogChannel">Moderation log channel</label>
        <input
          id="moderationLogChannel"
          name="moderationLogChannel"
          type="text"
          inputmode="numeric"
          value={data.settings.logChannels.moderation ?? ""}
          placeholder="Channel ID"
        />
      </div>
      <div class="field">
        <label for="securityLogChannel">Security log channel</label>
        <input
          id="securityLogChannel"
          name="securityLogChannel"
          type="text"
          inputmode="numeric"
          value={data.settings.logChannels.security ?? ""}
          placeholder="Channel ID"
        />
      </div>
      <div class="field">
        <label for="auditLogChannel">Audit log channel</label>
        <input
          id="auditLogChannel"
          name="auditLogChannel"
          type="text"
          inputmode="numeric"
          value={data.settings.logChannels.audit ?? ""}
          placeholder="Channel ID"
        />
      </div>
      <div class="field full">
        <label
          for="enforcePermits"
          style="display:flex;gap:0.5rem;align-items:center"
        >
          <input
            id="enforcePermits"
            name="enforcePermits"
            type="checkbox"
            checked={data.settings.enforcePermits}
          />
          Enforce permits for module commands
        </label>
        <span class="hint">
          When enabled, command execution must pass the permit chain in addition
          to Discord permissions.
        </span>
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Save settings</button>
    </div>
  </form>
</div>

<div class="panel">
  <h3>Stored settings keys</h3>
  {#if data.settingsKeys.length === 0}
    <p class="muted">No settings stored yet.</p>
  {:else}
    <p>
      {#each data.settingsKeys as key, index (key)}<code>{key}</code
        >{#if index < data.settingsKeys.length - 1}<span>, </span>{/if}{/each}
    </p>
  {/if}
</div>
