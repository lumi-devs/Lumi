<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

<h2>Add-on manager</h2>
<div class="notice warn">
  The dashboard manages the <code>downloader_repos</code> and
  <code>downloader_modules</code> database records only. It never runs shell commands.
  File checkout and module loading stay with the bot's add-on manager.
</div>

{#if data.form?.success}
  <div class="notice ok" role="status">{data.form.success}</div>
{/if}
{#if data.form?.error}
  <div class="notice error" role="alert">{data.form.error}</div>
{/if}

<div class="panel">
  <h3>Repositories</h3>
  {#if data.repos.length === 0}
    <p class="muted">No repositories registered.</p>
  {:else}
    {#each data.repos as repo (repo.id)}
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
        </div>

        {#if repo.candidates.length > 0}
          <div class="table-wrap" style="margin-top:0.6rem">
            <table>
              <thead>
                <tr
                  ><th>Candidate</th><th>Version</th><th>State</th><th></th></tr
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
                        >{candidate.installed ? "Installed" : "Available"}</span
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
                          <input type="hidden" name="repoId" value={repo.id} />
                          <input
                            type="hidden"
                            name="name"
                            value={candidate.name}
                          />
                          <input
                            type="hidden"
                            name="version"
                            value={candidate.version}
                          />
                          <input
                            type="hidden"
                            name="commit"
                            value={repo.commit ?? ""}
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
            <input type="hidden" name="repoId" value={repo.id} />
            <div class="form-grid">
              <div class="field">
                <label for="install-{repo.id}-name">Module name</label>
                <input
                  id="install-{repo.id}-name"
                  name="name"
                  type="text"
                  required
                />
              </div>
              <div class="field">
                <label for="install-{repo.id}-version">Version (optional)</label
                >
                <input
                  id="install-{repo.id}-version"
                  name="version"
                  type="text"
                  maxlength="32"
                />
              </div>
              <div class="field">
                <label for="install-{repo.id}-commit">Commit (optional)</label>
                <input
                  id="install-{repo.id}-commit"
                  name="commit"
                  type="text"
                  maxlength="40"
                />
              </div>
            </div>
            <div class="actions" style="margin-top:0.8rem">
              <button type="submit">Create install record</button>
            </div>
          </form>
        </details>

        <details style="margin-top:0.6rem">
          <summary>Edit repository</summary>
          <form method="POST" action="?/updateRepo">
            <input type="hidden" name="_csrf" value={data.csrfToken ?? ""} />
            <input type="hidden" name="id" value={repo.id} />
            <div class="form-grid">
              <div class="field">
                <label for="repo-{repo.id}-name">Name</label>
                <input
                  id="repo-{repo.id}-name"
                  name="name"
                  type="text"
                  value={repo.name}
                  required
                />
              </div>
              <div class="field">
                <label for="repo-{repo.id}-url">URL</label>
                <input
                  id="repo-{repo.id}-url"
                  name="url"
                  type="url"
                  value={repo.url}
                  required
                />
              </div>
              <div class="field">
                <label for="repo-{repo.id}-branch">Branch (optional)</label>
                <input
                  id="repo-{repo.id}-branch"
                  name="branch"
                  type="text"
                  value={repo.branch ?? ""}
                />
              </div>
            </div>
            <div class="actions" style="margin-top:0.8rem">
              <button type="submit">Save repository</button>
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
        <button type="submit">Register repository</button>
      </div>
    </form>
  </details>
</div>

<div class="panel">
  <h3>Installed modules</h3>
  {#if data.installed.length === 0}
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
          {#each data.installed as module (module.name)}
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
              </td>
            </tr>
            <tr>
              <td colspan="6">
                <details>
                  <summary>Update record for {module.name}</summary>
                  <form method="POST" action="?/update">
                    <input
                      type="hidden"
                      name="_csrf"
                      value={data.csrfToken ?? ""}
                    />
                    <input type="hidden" name="name" value={module.name} />
                    <div class="form-grid">
                      <div class="field">
                        <label for="module-{module.name}-version">Version</label
                        >
                        <input
                          id="module-{module.name}-version"
                          name="version"
                          type="text"
                          maxlength="32"
                          value={module.version ?? ""}
                        />
                      </div>
                      <div class="field">
                        <label for="module-{module.name}-commit">Commit</label>
                        <input
                          id="module-{module.name}-commit"
                          name="commit"
                          type="text"
                          maxlength="40"
                          value={module.commit ?? ""}
                        />
                      </div>
                    </div>
                    <div class="actions" style="margin-top:0.8rem">
                      <button type="submit">Save module record</button>
                    </div>
                  </form>
                </details>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
