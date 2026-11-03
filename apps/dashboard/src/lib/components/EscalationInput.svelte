<script lang="ts">
  import type { ConfigField } from "$lib/server/modules";

  interface Entry {
    id: number;
    count: number;
    action: string;
    minutes: number;
  }

  let {
    field,
    value,
  }: {
    field: ConfigField;
    value: unknown;
  } = $props();

  const DefaultTimeoutSeconds = 60;
  const DefaultDurationMinutes = 10;
  const actions = $derived(
    field.choices?.length ? field.choices : ["timeout", "kick", "ban"],
  );

  function initialEntries(raw: unknown): Entry[] {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return [];
    }
    const entries: Entry[] = [];
    let id = 0;
    for (const [key, item] of Object.entries(raw)) {
      const count = Number(key);
      if (!Number.isInteger(count) || count < 1) continue;
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        continue;
      }
      if (!("action" in item) || typeof item.action !== "string") continue;
      const action = actions.includes(item.action) ? item.action : actions[0];
      const seconds =
        "duration" in item &&
        typeof item.duration === "number" &&
        Number.isFinite(item.duration)
          ? item.duration
          : DefaultTimeoutSeconds;
      entries.push({
        id: id++,
        count,
        action,
        minutes: Math.max(1, Math.round(seconds / 60)),
      });
    }
    return entries.sort((a, b) => a.count - b.count);
  }

  let entries = $state<Entry[]>(initialEntries(value));
  let nextId = $state(entries.length);

  const serialized = $derived.by(() => {
    const record: Record<string, { action: string; duration: number | null }> =
      {};
    for (const entry of [...entries].sort((a, b) => a.count - b.count)) {
      if (!Number.isInteger(entry.count) || entry.count < 1) continue;
      if (!actions.includes(entry.action)) continue;
      record[String(entry.count)] = {
        action: entry.action,
        duration:
          entry.action === "timeout"
            ? Math.max(DefaultTimeoutSeconds, Math.round(entry.minutes * 60))
            : null,
      };
    }
    return JSON.stringify(record);
  });

  function nextCount(): number {
    const used = new Set(entries.map((entry) => entry.count));
    let count = 3;
    while (used.has(count)) count++;
    return count;
  }

  function addEntry(): void {
    entries = [
      ...entries,
      {
        id: nextId++,
        count: nextCount(),
        action: actions[0] ?? "timeout",
        minutes: DefaultDurationMinutes,
      },
    ];
  }

  function removeEntry(id: number): void {
    entries = entries.filter((entry) => entry.id !== id);
  }
</script>

<div class="field full">
  <span class="label"
    >{field.label}{#if field.required}<span aria-hidden="true">
        *</span
      >{/if}</span
  >
  <input type="hidden" name={field.key} value={serialized} />
  {#if entries.length === 0}
    <p class="muted" style="margin:0.4rem 0">
      No escalation rules. Warnings only create cases until you add a rule.
    </p>
  {:else}
    <div class="escalation-list">
      {#each entries as entry (entry.id)}
        <div class="escalation-row">
          <div class="field">
            <label for="warn-count-{entry.id}">Warnings</label>
            <input
              id="warn-count-{entry.id}"
              type="number"
              min="1"
              max="1000"
              bind:value={entry.count}
            />
          </div>
          <div class="field">
            <label for="warn-action-{entry.id}">Action</label>
            <select id="warn-action-{entry.id}" bind:value={entry.action}>
              {#each actions as action (action)}
                <option value={action}>{action}</option>
              {/each}
            </select>
          </div>
          <div class="field">
            <label for="warn-duration-{entry.id}">Timeout (minutes)</label>
            <input
              id="warn-duration-{entry.id}"
              type="number"
              min="1"
              max="40320"
              bind:value={entry.minutes}
              disabled={entry.action !== "timeout"}
            />
          </div>
          <button
            type="button"
            class="danger"
            onclick={() => removeEntry(entry.id)}
          >
            Remove
          </button>
        </div>
      {/each}
    </div>
  {/if}
  <div class="actions" style="margin-top:0.6rem">
    <button type="button" onclick={addEntry}>Add escalation rule</button>
  </div>
  {#if field.description}<span class="hint">{field.description}</span>{/if}
</div>

<style>
  .label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.45rem;
  }
  .escalation-list {
    display: grid;
    gap: 0.65rem;
  }
  .escalation-row {
    display: grid;
    grid-template-columns:
      minmax(7rem, 0.7fr) minmax(9rem, 1fr) minmax(10rem, 1fr)
      auto;
    gap: 0.65rem;
    align-items: end;
  }
  .escalation-row button {
    margin-bottom: 0.1rem;
  }
  @media (max-width: 720px) {
    .escalation-row {
      grid-template-columns: 1fr;
    }
  }
</style>
