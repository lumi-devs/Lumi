<script lang="ts">
  import { formatDate } from "$lib/format";
  let { data } = $props();
</script>

<svelte:head>
  <title>Verify · Lumi</title>
</svelte:head>

<div class="verify-wrap">
  <div class="panel">
    {#if data.form?.success}
      <p class="badge on">Verified</p>
      <h1>You're in</h1>
      <div class="notice ok" role="status">{data.form.success}</div>
      <p class="muted">You can close this tab and return to Discord.</p>
    {:else if data.state === "invalid"}
      <p class="badge warn">Invalid link</p>
      <h1>Verification link not found</h1>
      <p>
        This link is malformed or no longer exists. Ask a server admin for a new
        verification link.
      </p>
    {:else if data.state === "used"}
      <p class="badge on">Already used</p>
      <h1>Verification already completed</h1>
      <p>
        This verification link has already been used. If you still cannot access
        the server, ask a server admin for help.
      </p>
    {:else if data.state === "expired"}
      <p class="badge warn">Expired</p>
      <h1>Verification link expired</h1>
      <p>
        This link has expired. Ask a server admin to create a new verification
        link.
      </p>
    {:else if data.state === "misconfigured"}
      <p class="badge warn">Not configured</p>
      <h1>Verification unavailable</h1>
      <p>
        This server has not configured a verified role yet. Ask a server admin
        to finish verification setup in the dashboard.
      </p>
      {#if data.guild}
        <p class="hint">Server: {data.guild.name}</p>
      {/if}
    {:else if data.state === "ready" && data.token && data.captcha}
      <p class="badge">Verification</p>
      <h1>Verify for {data.guild?.name}</h1>
      <div class="grid" style="margin-bottom:1rem">
        <div class="stat">
          <strong>{data.user?.username}</strong>
          <span>Discord user</span>
        </div>
        <div class="stat">
          <strong>{data.guild?.name}</strong>
          <span>Server</span>
        </div>
      </div>
      <p class="muted">
        Complete the math question to prove you are human. The link expires
        {formatDate(data.token.expiresAt)}.
      </p>
      {#if data.roles.verified}
        <p class="hint">
          On success you receive <strong>{data.roles.verified}</strong
          >{#if data.roles.pending}, and <strong>{data.roles.pending}</strong> is
            removed{/if}.
        </p>
      {/if}

      {#if data.form?.error}
        <div class="notice error" role="alert">{data.form.error}</div>
      {/if}

      <form method="POST">
        <input type="hidden" name="nonce" value={data.captcha.nonce} />
        <div class="field">
          <label for="captcha-answer">What is {data.captcha.question}?</label>
          <span class="captcha" aria-hidden="true"
            >{data.captcha.question} = ?</span
          >
          <input
            id="captcha-answer"
            name="answer"
            type="number"
            inputmode="numeric"
            autocomplete="off"
            required
          />
        </div>
        <div class="actions" style="margin-top:1rem">
          <button type="submit">Verify me</button>
        </div>
      </form>
    {:else}
      <h1>Verification unavailable</h1>
      <p>This verification link cannot be used right now.</p>
    {/if}
  </div>
</div>
