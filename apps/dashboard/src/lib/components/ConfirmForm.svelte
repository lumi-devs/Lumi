<script lang="ts">
  interface HiddenField {
    name: string;
    value: string | number;
  }

  interface Props {
    action: string;
    csrfToken: string;
    buttonLabel: string;
    message: string;
    confirmLabel?: string;
    hidden?: HiddenField[];
    small?: boolean;
  }

  let {
    action,
    csrfToken,
    buttonLabel,
    message,
    confirmLabel = "Confirm delete",
    hidden = [],
    small = false,
  }: Props = $props();

  let confirming = $state(false);
</script>

{#if !confirming}
  <button
    class="danger"
    class:small
    type="button"
    onclick={() => (confirming = true)}
  >
    {buttonLabel}
  </button>
{:else}
  <form method="POST" {action} class="confirm-form">
    <input type="hidden" name="_csrf" value={csrfToken} />
    {#each hidden as field (field.name)}
      <input type="hidden" name={field.name} value={field.value} />
    {/each}
    <span class="confirm-message" role="alert">{message}</span>
    <span class="confirm-actions">
      <button class="danger" class:small type="submit">{confirmLabel}</button>
      <button
        class="secondary"
        class:small
        type="button"
        onclick={() => (confirming = false)}
      >
        Cancel
      </button>
    </span>
  </form>
{/if}

<style>
  .confirm-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }

  .confirm-message {
    font-size: 0.85rem;
    color: var(--ink);
  }

  .confirm-actions {
    display: inline-flex;
    gap: 0.4rem;
    margin-left: auto;
  }
</style>
