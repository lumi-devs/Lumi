<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

<h2>Security</h2>
<p class="muted">
  Security module settings, panic controls, backups, and web verification.
  Changes are saved to <code>Guild.settings</code>; panic state lives in Redis.
</p>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}
{#if data.form?.verificationLink}
  <div class="notice warn">
    <p><strong>One-time verification link</strong></p>
    <p><a href={data.form.verificationLink}>{data.form.verificationLink}</a></p>
    <p class="hint">Only the SHA-256 hash is stored. Copy this link now.</p>
  </div>
{/if}

<div class="panel">
  <h3>Panic mode</h3>
  {#if data.panic}
    <div class="notice error">
      <p><strong>Panic mode is active.</strong></p>
      <p>
        Reason: {data.panic.reason}<br />
        Started: {formatDate(data.panic.startedAtIso)}<br />
        Ends: {formatDate(data.panic.untilIso)}<br />
        Moderation commands locked:
        {data.panic.lockModCommands ? "Yes" : "No"}
      </p>
    </div>
    <form method="POST" action="?/endPanic">
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <button class="danger" type="submit">End panic mode</button>
    </form>
  {:else}
    <p class="muted">Panic mode is not active.</p>
    <form method="POST" action="?/startPanic">
      <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
      <div class="form-grid">
        <div class="field">
          <label for="panic-minutes">Duration (minutes)</label>
          <input
            id="panic-minutes"
            name="minutes"
            type="number"
            min="1"
            max="1440"
            value="30"
          />
        </div>
        <div class="field full">
          <label for="panic-reason">Reason</label>
          <input
            id="panic-reason"
            name="reason"
            type="text"
            maxlength="200"
            required
            placeholder="Suspected raid"
          />
        </div>
        <div class="field full">
          <label style="display:flex;gap:0.5rem;align-items:center">
            <input type="checkbox" name="lockModCommands" />
            Lock moderation commands while panic is active
          </label>
        </div>
      </div>
      <div class="actions" style="margin-top:1rem">
        <button class="danger" type="submit">Start panic mode</button>
      </div>
    </form>
  {/if}
</div>

<div class="panel">
  <h3>Verification</h3>
  <form method="POST" action="?/saveVerification">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label
          for="v-enabled"
          style="display:flex;gap:0.5rem;align-items:center"
        >
          <input
            id="v-enabled"
            type="checkbox"
            name="enabled"
            checked={data.verification.enabled}
          />
          Verification enabled
        </label>
      </div>
      <div class="field">
        <label for="v-mode">Mode</label>
        <select id="v-mode" name="mode">
          <option value="emoji" selected={data.verification.mode === "emoji"}
            >Emoji captcha</option
          >
          <option value="web" selected={data.verification.mode === "web"}
            >Web link</option
          >
          <option value="none" selected={data.verification.mode === "none"}
            >Automatic</option
          >
        </select>
      </div>
      <div class="field">
        <label for="v-target">Target</label>
        <select id="v-target" name="target">
          <option
            value="everyone"
            selected={data.verification.target === "everyone"}>Everyone</option
          >
          <option
            value="suspicious"
            selected={data.verification.target === "suspicious"}
            >Suspicious members</option
          >
        </select>
      </div>
      <div class="field">
        <label for="v-verified">Verified role</label>
        <select id="v-verified" name="verifiedRoleId">
          <option value="">Not configured</option>
          {#each data.roles as role (role.id)}
            <option
              value={role.id}
              selected={data.verification.verifiedRoleId === role.id}
              >{role.name}</option
            >
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="v-pending">Pending role</label>
        <select id="v-pending" name="pendingRoleId">
          <option value="">Not configured</option>
          {#each data.roles as role (role.id)}
            <option
              value={role.id}
              selected={data.verification.pendingRoleId === role.id}
              >{role.name}</option
            >
          {/each}
        </select>
      </div>
      <div class="field">
        <label for="v-timeout">Timeout (minutes)</label>
        <input
          id="v-timeout"
          name="timeoutMinutes"
          type="number"
          min="1"
          max="1440"
          value={data.verification.timeoutMinutes}
        />
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="kickOnTimeout"
            checked={data.verification.kickOnTimeout}
          />
          Kick on timeout
        </label>
      </div>
    </div>
    {#if !data.botRolesAvailable}
      <p class="hint">
        Role list unavailable (bot token or guild access). Enter role IDs in the
        text fields instead.
      </p>
    {/if}
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Save verification settings</button>
    </div>
  </form>

  <h4 style="margin-top:1.5rem">Create verification link</h4>
  {#if !data.verification.verifiedRoleId}
    <p class="notice warn">
      Save a verified role first. The web verifier refuses to grant access
      without one.
    </p>
  {/if}
  <form method="POST" action="?/createVerification">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label for="vt-user">User ID</label>
        <input
          id="vt-user"
          name="userId"
          type="text"
          inputmode="numeric"
          required
        />
      </div>
      <div class="field">
        <label for="vt-minutes">Expires in (minutes)</label>
        <input
          id="vt-minutes"
          name="minutes"
          type="number"
          min="5"
          max="1440"
          value="30"
        />
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Create link</button>
    </div>
  </form>

  <h4 style="margin-top:1.5rem">Recent tokens</h4>
  {#if data.tokens.length === 0}
    <p class="muted">No verification tokens created.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Status</th>
            <th>Created</th>
            <th>Expires</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each data.tokens as token (token.id)}
            <tr>
              <td><code>{token.userId}</code></td>
              <td>
                {#if token.usedAt}
                  <span class="badge on">Used</span>
                {:else if token.expired}
                  <span class="badge warn">Expired</span>
                {:else}
                  <span class="badge">Pending</span>
                {/if}
              </td>
              <td>{formatDate(token.createdAt)}</td>
              <td>{formatDate(token.expiresAt)}</td>
              <td>
                <form method="POST" action="?/revokeVerification">
                  <input
                    type="hidden"
                    name="_csrf"
                    value={data.csrfToken ?? ""}
                  />
                  <input type="hidden" name="id" value={token.id} />
                  <button class="secondary small" type="submit">Revoke</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<div class="panel">
  <h3>Security module</h3>
  <form method="POST" action="?/saveSecurity">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label for="s-log">Security log channel</label>
        <input
          id="s-log"
          name="logChannelId"
          type="text"
          inputmode="numeric"
          value={data.security.logChannelId ?? ""}
          placeholder="Channel ID"
        />
      </div>
      <div class="field">
        <label for="s-quarantine">Quarantine role</label>
        <select id="s-quarantine" name="quarantineRoleId">
          <option value="">Not configured</option>
          {#each data.roles as role (role.id)}
            <option
              value={role.id}
              selected={data.security.quarantineRoleId === role.id}
              >{role.name}</option
            >
          {/each}
        </select>
      </div>
      <div class="field full">
        <label for="s-trusted">Trusted role IDs</label>
        <textarea id="s-trusted" name="trustedRoleIds"
          >{data.security.trustedRoleIds.join("\n")}</textarea
        >
        <span class="hint">One role ID per line or comma-separated.</span>
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Save security module settings</button>
    </div>
  </form>
</div>

<div class="panel">
  <h3>Panic triggers</h3>
  <form method="POST" action="?/savePanic">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="enabled"
            checked={data.panicConfig.enabled}
          />
          Panic mode enabled
        </label>
      </div>
      <div class="field">
        <label for="p-burst">Burst limit</label>
        <input
          id="p-burst"
          name="burstLimit"
          type="number"
          min="1"
          max="20"
          value={data.panicConfig.burstLimit}
        />
      </div>
      <div class="field">
        <label for="p-window">Burst window (seconds)</label>
        <input
          id="p-window"
          name="burstWindowSeconds"
          type="number"
          min="1"
          max="10"
          value={data.panicConfig.burstWindowSeconds}
        />
      </div>
      <div class="field">
        <label for="p-duration">Default duration (minutes)</label>
        <input
          id="p-duration"
          name="durationMinutes"
          type="number"
          min="1"
          max="1440"
          value={data.panicConfig.durationMinutes}
        />
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="notifyOwners"
            checked={data.panicConfig.notifyOwners}
          />
          Notify owners
        </label>
      </div>
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="lockModCommands"
            checked={data.panicConfig.lockModCommands}
          />
          Lock moderation commands
        </label>
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Save panic trigger settings</button>
    </div>
  </form>
</div>

<div class="panel">
  <h3>Backups</h3>
  <form method="POST" action="?/saveBackups">
    <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
    <div class="form-grid">
      <div class="field">
        <label style="display:flex;gap:0.5rem;align-items:center">
          <input
            type="checkbox"
            name="enabled"
            checked={data.backupsConfig.enabled}
          />
          Scheduled backups enabled
        </label>
      </div>
      <div class="field">
        <label for="b-interval">Interval (hours)</label>
        <input
          id="b-interval"
          name="intervalHours"
          type="number"
          min="1"
          max="168"
          value={data.backupsConfig.intervalHours}
        />
      </div>
      <div class="field">
        <label for="b-keep">Keep count</label>
        <input
          id="b-keep"
          name="keepCount"
          type="number"
          min="1"
          max="50"
          value={data.backupsConfig.keepCount}
        />
      </div>
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="submit">Save backup settings</button>
    </div>
  </form>

  <h4 style="margin-top:1.5rem">Stored backups</h4>
  {#if data.backups.length === 0}
    <p class="muted">No backups stored.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>Reason</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.backups as backup (backup.id)}
            <tr>
              <td><code>{backup.id}</code></td>
              <td>{backup.reason}</td>
              <td>{formatDate(backup.createdAt)}</td>
              <td>
                <form method="POST" action="?/deleteBackup">
                  <input
                    type="hidden"
                    name="_csrf"
                    value={data.csrfToken ?? ""}
                  />
                  <input type="hidden" name="id" value={backup.id} />
                  <button class="danger small" type="submit">Delete</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
