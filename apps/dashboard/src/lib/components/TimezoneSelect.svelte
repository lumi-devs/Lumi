<script lang="ts">
  interface Props {
    id: string;
    name: string;
    value?: string;
    hint?: string;
  }

  let {
    id,
    name,
    value = $bindable(""),
    hint = "Used for schedules and expiry checks. Defaults to UTC.",
  }: Props = $props();

  const FallbackTimezones = [
    "UTC",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Warsaw",
    "Europe/Moscow",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Sao_Paulo",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Dhaka",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];

  function supportedTimezones(): string[] {
    const intl = Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    };
    const zones = intl.supportedValuesOf?.("timeZone") ?? [];
    return zones.length > 0 ? zones : FallbackTimezones;
  }

  const allTimezones = $derived(
    Array.from(
      new Set([...supportedTimezones(), "UTC", value].filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right)),
  );

  let open = $state(false);
  let searchQuery = $state("");

  const displayValue = $derived(value || "Server default (UTC)");
  const defaultMatches = $derived(
    searchQuery.trim() === "" ||
      "server default utc".includes(searchQuery.trim().toLowerCase()),
  );
  const filtered = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allTimezones;
    return allTimezones.filter((zone) =>
      `${zone} ${zone.replace(/[_/]/g, " ")}`.toLowerCase().includes(query),
    );
  });

  function choose(zone: string): void {
    value = zone;
    open = false;
    searchQuery = "";
  }
</script>

<input type="hidden" {name} {value} />
<div
  class="timezone-select"
  {id}
  onkeydown={(event) => {
    if (event.key === "Escape") open = false;
  }}
>
  <button
    type="button"
    class="timezone-trigger"
    aria-expanded={open}
    aria-haspopup="listbox"
    onclick={() => (open = !open)}
  >
    <span class:placeholder={!value}>{displayValue}</span>
    <span class="chevron" class:open>▾</span>
  </button>

  {#if open}
    <div class="timezone-panel">
      <input
        type="search"
        placeholder="Search timezones..."
        bind:value={searchQuery}
        autocomplete="off"
        aria-label="Search timezones"
        autofocus
      />
      <div class="timezone-options" role="listbox" aria-label="Timezones">
        {#if defaultMatches}
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            class:selected={value === ""}
            onclick={() => choose("")}
          >
            Server default (UTC)
          </button>
        {/if}
        {#each filtered as zone (zone)}
          <button
            type="button"
            role="option"
            aria-selected={value === zone}
            class:selected={value === zone}
            onclick={() => choose(zone)}
          >
            {zone}
          </button>
        {/each}
        {#if filtered.length === 0 && !defaultMatches}
          <p class="empty">No timezones match “{searchQuery}”.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
<span class="hint">{hint}</span>

<style>
  .timezone-select {
    position: relative;
  }

  .timezone-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .timezone-trigger:hover {
    border-color: var(--muted);
  }

  .timezone-trigger .placeholder {
    color: var(--muted);
  }

  .chevron {
    color: var(--muted);
    transition: transform 120ms ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .timezone-panel {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.35rem);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
  }

  .timezone-options {
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .timezone-options button {
    width: 100%;
    padding: 0.4rem 0.55rem;
    border: none;
    border-radius: 4px;
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .timezone-options button:hover {
    background: var(--surface-2);
  }

  .timezone-options button.selected {
    background: var(--surface-2);
    font-weight: 600;
  }

  .empty {
    margin: 0;
    padding: 0.4rem 0.55rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
