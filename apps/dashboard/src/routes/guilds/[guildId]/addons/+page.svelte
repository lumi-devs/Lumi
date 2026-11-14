<script lang="ts">
  import ConfirmForm from "#lib/components/ConfirmForm.svelte";
  import { formatDate } from "#lib/format.js";
  let { data, form } = $props();
</script>

<h2>Add-ons</h2>
<div class="notice">
  The dashboard calls the bot's add-on API. Cloning, file materialization, and
  module mounting happen in the bot process, never in the dashboard.
</div>

{#if form?.success}
  <div class="notice ok" role="status">{form.success}</div>
{/if}
{#if form?.error}
  <div class="notice error" role="alert">{form.error}</div>
{/if}

{#if !data.catalog}
  <div class="notice warn" role="status">
    The bot RPC API is unreachable, so add-on state is unavailable.
    {#if data.rpcError}<span class="muted">({data.rpcError})</span>{/if}
  </div>
{:else}
  {@const catalog = data.catalog}
  <div class="panel">
    <h3>Repositories</h3>
    {#if catalog.repos.length === 0}
      <p class="muted">No repositories registered.</p>
    {:else}
      {#each catalog.repos as repo (repo.id)}
        <div class="panel" style="box-shadow:none">
          <div class="actions" style="justify-content:space-between">
            <div>
              <strong>{repo.name}</strong>
              <span class="badge">{repo.installed} modules</span>
              <div class="muted">
                <code>{repo.url}</code>
                {#if repo.branch}· branch <code>{repo.branch}</code>{/if}
                {#if repo.commit}· <code>{repo.commit.slice(0, 12)}</code>{/if}
              </div>
            </div>
            <div class="actions">
              <form method="POST" action="?/updateRepo">
                <input
                  type="hidden"
                  name="_csrf"
                  value={data.csrfToken ?? ""}
                />
                <input type="hidden" name="name" value={repo.name} />
                <button class="secondary small" type="submit"
                  >Update from remote</button
                >
              </form>
              <ConfirmForm
                action="?/removeRepo"
                csrfToken={data.csrfToken ?? ""}
                buttonLabel="Remove"
                message="Remove this repository? Uninstall its add-ons first."
                confirmLabel="Remove repository"
                hidden={[{ name: "name", value: repo.name }]}
                small
              />
            </div>
          </div>

          {#if repo.candidates.length > 0}
            <div class="table-wrap" style="margin-top:0.6rem">
              <table>
                <thead>
                  <tr
                    ><th>Candidate</th><th>Version</th><th>State</th><th
                    ></th></tr
                  >
                </thead>
                <tbody>
                  {#each repo.candidates as candidate (candidate.name)}
                    <tr>
                      <td>
                        <strong>{candidate.displayName}</strong>
                        <div class="muted"><code>{candidate.name}</code></div>
                      </td>
                      <td>{candidate.version}</td>
                      <td>
                        <span class="badge {candidate.installed ? 'on' : 'off'}"
                          >{candidate.installed
                            ? "Installed"
                            : "Available"}</span
                        >
                      </td>
                      <td>
                        {#if !candidate.installed}
                          <form method="POST" action="?/install">
                            <input
                              type="hidden"
                              name="_csrf"
                              value={data.csrfToken ?? ""}
                            />
                            <input
                              type="hidden"
                              name="repo"
                              value={repo.name}
                            />
                            <input
                              type="hidden"
                              name="name"
                              value={candidate.name}
                            />
                            <button class="small" type="submit">Install</button>
                          </form>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <details style="margin-top:0.6rem">
            <summary>Install by name</summary>
            <form method="POST" action="?/install">
              <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
              <input type="hidden" name="repo" value={repo.name} />
              <div class="form-grid">
                <div class="field">
                  <label for="install-{repo.id}-name">Module name</label>
                  <input
                    id="install-{repo.id}-name"
                    name="name"
                    type="text"
                    required
                  />
                  <span class="hint"
                    >Read from the repository's manifest by the bot.</span
                  >
                </div>
              </div>
              <div class="actions" style="margin-top:0.8rem">
                <button type="submit">Install add-on</button>
              </div>
            </form>
          </details>
        </div>
      {/each}
    {/if}

    <details style="margin-top:1rem">
      <summary><strong>Register repository</strong></summary>
      <form method="POST" action="?/addRepo">
        <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
        <div class="form-grid">
          <div class="field">
            <label for="repo-new-name">Name</label>
            <input id="repo-new-name" name="name" type="text" required />
            <span class="hint">Lowercase letters, digits, and dashes.</span>
          </div>
          <div class="field">
            <label for="repo-new-url">HTTPS URL</label>
            <input id="repo-new-url" name="url" type="url" required />
          </div>
          <div class="field">
            <label for="repo-new-branch">Branch (optional)</label>
            <input id="repo-new-branch" name="branch" type="text" />
          </div>
        </div>
        <div class="actions" style="margin-top:0.8rem">
          <button type="submit">Clone repository</button>
        </div>
      </form>
    </details>
  </div>

  <div class="panel">
    <h3>Installed modules</h3>
    {#if catalog.installed.length === 0}
      <p class="muted">No add-on modules installed.</p>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Repo</th>
              <th>Version</th>
              <th>Commit</th>
              <th>Installed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each catalog.installed as module (module.name)}
              <tr>
                <td>
                  <strong>{module.name}</strong>
                  {#if module.pinned}<span class="badge warn">pinned</span>{/if}
                </td>
                <td>{module.repoName}</td>
                <td>{module.version ?? "—"}</td>
                <td><code>{module.commit?.slice(0, 12) ?? "—"}</code></td>
                <td>{formatDate(module.installedAt)}</td>
                <td>
                  <div class="actions">
                    <a
                      class="button secondary small"
                      href="/guilds/{data.guild.id}/modules/{module.name}"
                      >Configure</a
                    >
                    <form method="POST" action="?/pin">
                      <input
                        type="hidden"
                        name="_csrf"
                        value={data.csrfToken ?? ""}
                      />
                      <input type="hidden" name="name" value={module.name} />
                      <input
                        type="hidden"
                        name="pinned"
                        value={module.pinned ? "false" : "true"}
                      />
                      <button class="secondary small" type="submit"
                        >{module.pinned ? "Unpin" : "Pin"}</button
                      >
                    </form>
                    <ConfirmForm
                      action="?/uninstall"
                      csrfToken={data.csrfToken ?? ""}
                      buttonLabel="Uninstall"
                      message="Uninstall {module.name}? Its configuration is kept in the database."
                      confirmLabel="Uninstall"
                      hidden={[{ name: "name", value: module.name }]}
                      small
                    />
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}
