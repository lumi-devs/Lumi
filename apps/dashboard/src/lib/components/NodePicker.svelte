<script lang="ts">
  interface Props {
    id: string;
    name: string;
    nodes?: string[];
    selected?: string[];
    hint?: string;
  }

  let {
    id,
    name,
    nodes = [],
    selected = $bindable([]),
    hint = "Choose one or more permission nodes.",
  }: Props = $props();

  interface NodeGroup {
    key: string;
    label: string;
    nodes: string[];
  }

  let searchQuery = $state("");
  let expandedGroups = $state<Set<string>>(
    new Set(selected.map((node) => namespaceOf(node))),
  );

  function namespaceOf(node: string): string {
    if (node === "*") return "global";
    const index = node.indexOf(".");
    return index === -1 ? "global" : node.slice(0, index);
  }

  function groupLabel(namespace: string): string {
    if (namespace === "global") return "Global";
    return namespace.charAt(0).toUpperCase() + namespace.slice(1);
  }

  const filteredGroups = $derived.by((): NodeGroup[] => {
    const query = searchQuery.trim().toLowerCase();
    const groups = new Map<string, string[]>();
    for (const node of nodes) {
      if (query && !node.toLowerCase().includes(query)) continue;
      const key = namespaceOf(node);
      const bucket = groups.get(key);
      if (bucket) bucket.push(node);
      else groups.set(key, [node]);
    }
    return Array.from(groups.entries())
      .sort(([left], [right]) => {
        if (left === "global") return -1;
        if (right === "global") return 1;
        return groupLabel(left).localeCompare(groupLabel(right));
      })
      .map(([key, groupNodes]) => ({
        key,
        label: groupLabel(key),
        nodes: groupNodes,
      }));
  });

  const searching = $derived(searchQuery.trim().length > 0);
  const visibleCount = $derived(
    filteredGroups.reduce((total, group) => total + group.nodes.length, 0),
  );

  function isExpanded(group: NodeGroup): boolean {
    return searching || expandedGroups.has(group.key);
  }

  function toggleExpanded(group: NodeGroup): void {
    if (expandedGroups.has(group.key)) expandedGroups.delete(group.key);
    else expandedGroups.add(group.key);
    expandedGroups = new Set(expandedGroups);
  }

  function selectedIn(group: NodeGroup): number {
    return group.nodes.filter((node) => selected.includes(node)).length;
  }

  function groupChecked(group: NodeGroup): boolean {
    return group.nodes.every((node) => selected.includes(node));
  }

  function groupMixed(group: NodeGroup): boolean {
    const count = selectedIn(group);
    return count > 0 && count < group.nodes.length;
  }

  function toggleGroup(group: NodeGroup): void {
    if (groupChecked(group)) {
      const remove = new Set(group.nodes);
      selected = selected.filter((node) => !remove.has(node));
      return;
    }
    selected = Array.from(new Set([...selected, ...group.nodes]));
  }

  function toggleNode(node: string): void {
    if (selected.includes(node)) {
      selected = selected.filter((value) => value !== node);
    } else {
      selected = [...selected, node];
    }
  }

  function remove(node: string): void {
    selected = selected.filter((value) => value !== node);
  }

  function clear(): void {
    selected = [];
  }

  function setIndeterminate(
    node: HTMLInputElement,
    value: boolean,
  ): { update: (next: boolean) => void } {
    node.indeterminate = value;
    return {
      update(next: boolean) {
        node.indeterminate = next;
      },
    };
  }
</script>

<input type="hidden" {name} value={selected.join(",")} />
<div class="node-picker" {id}>
  <div class="node-toolbar">
    <input
      type="text"
      placeholder="Search permission nodes..."
      bind:value={searchQuery}
      autocomplete="off"
      aria-label="Search permission nodes"
    />
    {#if selected.length > 0}
      <button type="button" class="clear-button" onclick={clear}>
        Clear ({selected.length})
      </button>
    {/if}
  </div>

  {#if filteredGroups.length === 0}
    <p class="empty">No nodes match “{searchQuery}”.</p>
  {:else}
    <div class="node-groups">
      {#each filteredGroups as group (group.key)}
        <div class="node-group">
          <div class="group-header">
            <button
              type="button"
              class="group-toggle"
              aria-expanded={isExpanded(group)}
              onclick={() => toggleExpanded(group)}
            >
              <span class="chevron" class:open={isExpanded(group)}>▸</span>
              <span class="group-name">{group.label}</span>
              <span class="group-count">
                {selectedIn(group)}/{group.nodes.length}
              </span>
            </button>
            <label class="group-select" title="Select all {group.label}">
              <input
                type="checkbox"
                checked={groupChecked(group)}
                use:setIndeterminate={groupMixed(group)}
                onchange={() => toggleGroup(group)}
              />
              <span class="sr-only">Select all {group.label}</span>
            </label>
          </div>

          {#if isExpanded(group)}
            <div class="group-nodes">
              {#each group.nodes as node (node)}
                <label class="node-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(node)}
                    onchange={() => toggleNode(node)}
                  />
                  <code>{node}</code>
                  {#if node.endsWith(".*")}
                    <span class="node-badge">all</span>
                  {/if}
                </label>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if selected.length > 0}
    <div class="selected-nodes">
      {#each selected as node (node)}
        <span class="node-tag">
          {node}
          <button
            type="button"
            aria-label="Remove {node}"
            onclick={() => remove(node)}>×</button
          >
        </span>
      {/each}
    </div>
  {/if}
  {#if searching}
    <span class="hint">{visibleCount} matching nodes</span>
  {/if}
</div>
<span class="hint">{hint}</span>

<style>
  .node-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .node-toolbar {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .node-toolbar input {
    flex: 1;
  }

  .clear-button {
    background: none;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }

  .clear-button:hover {
    color: var(--danger);
    border-color: var(--danger);
  }

  .node-groups {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }

  .node-group + .node-group {
    border-top: 1px solid var(--line);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface-2);
  }

  .group-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.65rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .group-toggle:hover {
    background: color-mix(in srgb, var(--line) 35%, transparent);
  }

  .chevron {
    display: inline-block;
    width: 1rem;
    color: var(--muted);
    transition: transform 120ms ease;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .group-name {
    font-weight: 600;
  }

  .group-count {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .group-select {
    display: flex;
    align-items: center;
    padding: 0.55rem 0.65rem;
    cursor: pointer;
  }

  .group-nodes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.1rem 1rem;
    padding: 0.4rem 0.65rem 0.6rem;
  }

  .node-option {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.2rem;
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 4px;
  }

  .node-option:hover {
    background: var(--surface-2);
  }

  .node-option code {
    overflow-wrap: anywhere;
  }

  .node-badge {
    margin-left: auto;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 0.4rem;
    color: var(--muted);
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .empty {
    margin: 0;
    padding: 0.75rem;
    border: 1px dashed var(--line);
    border-radius: 6px;
    color: var(--muted);
  }

  .selected-nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .node-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 0.125rem 0.5rem;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .node-tag button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.25rem;
    color: var(--muted);
  }

  .node-tag button:hover {
    color: var(--danger);
  }
</style>
