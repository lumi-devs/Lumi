<script lang="ts">
  import type { ConfigField } from "$lib/server/modules";

  interface Props {
    field: ConfigField;
    value: unknown;
  }

  let { field, value }: Props = $props();

  const id = $derived(`cfg_${field.key}`);
  const hint = $derived(field.description ?? "");
  const multi = $derived(
    field.type === "multi-channel" ||
      field.type === "multi-role" ||
      field.type === "multi-string",
  );

  function textValue(): string {
    if (value === undefined || value === null) return "";
    if (multi) {
      return Array.isArray(value) ? value.join("\n") : String(value);
    }
    if (field.type === "json") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
</script>

<div class="field" class:full={field.type === "json" || multi}>
  {#if field.type === "boolean"}
    <label for={id} style="display:flex;gap:0.5rem;align-items:center">
      <input {id} name={field.key} type="checkbox" checked={Boolean(value)} />
      {field.label}
    </label>
    {#if hint}<span class="hint">{hint}</span>{/if}
  {:else}
    <label for={id}>
      {field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}
    </label>
    {#if field.type === "select" && field.choices?.length}
      <select {id} name={field.key}>
        {#each field.choices as choice (choice)}
          <option value={choice} selected={String(value ?? "") === choice}
            >{choice}</option
          >
        {/each}
      </select>
    {:else if field.type === "json"}
      <textarea {id} name={field.key} rows="8" spellcheck="false"
        >{textValue()}</textarea
      >
    {:else if multi}
      <textarea
        {id}
        name={field.key}
        rows="4"
        placeholder="One value per line, or comma-separated"
        >{textValue()}</textarea
      >
    {:else if field.type === "number"}
      <input
        {id}
        name={field.key}
        type="number"
        value={textValue()}
        step="any"
        min={field.min}
        max={field.max}
      />
    {:else if field.type === "channel"}
      <input
        {id}
        name={field.key}
        type="text"
        inputmode="numeric"
        placeholder="Channel ID"
        value={textValue()}
      />
    {:else if field.type === "role"}
      <input
        {id}
        name={field.key}
        type="text"
        inputmode="numeric"
        placeholder="Role ID"
        value={textValue()}
      />
    {:else}
      <input
        {id}
        name={field.key}
        type="text"
        value={textValue()}
        required={field.required}
      />
    {/if}
    {#if hint}<span class="hint">{hint}</span>{/if}
    {#if field.type === "channel" || field.type === "role"}
      <span class="hint">Discord snowflake ID.</span>
    {/if}
    {#if multi}
      <span class="hint">Discord IDs, one per line or comma-separated.</span>
    {/if}
  {/if}
</div>
