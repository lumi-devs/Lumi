<script lang="ts">
  import { page } from "$app/stores";
  let { data, children } = $props();

  const links = [
    { href: "", label: "Overview" },
    { href: "/modules", label: "Modules" },
    { href: "/permits", label: "Permits" },
    { href: "/settings", label: "Server settings" },
    { href: "/cases", label: "Cases & audit" },
    { href: "/security", label: "Security" },
    { href: "/features", label: "Features" },
    { href: "/stats", label: "Stats" },
    { href: "/addons", label: "Add-ons" },
  ];

  const base = $derived(`/guilds/${data.guild.id}`);
  const currentPath = $derived($page.url.pathname);

  function isActive(href: string): boolean {
    const target = `${base}${href}`;
    if (href === "") return currentPath === base || currentPath === `${base}/`;
    return currentPath === target || currentPath.startsWith(`${target}/`);
  }
</script>

<svelte:head>
  <title>{data.guild.name} · Lumi Dashboard</title>
</svelte:head>

<div class="page-hero">
  <a
    href="/guilds"
    class="guild-icon"
    aria-label="Back to server list"
    style="text-decoration:none"
  >
    {#if data.guild.iconUrl}
      <img
        src={data.guild.iconUrl}
        alt=""
        width="56"
        height="56"
        style="width:56px;height:56px;border-radius:14px;object-fit:cover"
      />
    {:else}
      {data.guild.name.slice(0, 2).toUpperCase()}
    {/if}
  </a>
  <div>
    <h1 style="margin-bottom:0.1rem">{data.guild.name}</h1>
    <p class="muted" style="margin:0">
      {data.guild.owner ? "Server owner" : "Manage Server"} · {data.guild.id}
      {#if !data.guild.known}
        · <span class="badge warn">not synced to database</span>
      {/if}
    </p>
  </div>
</div>

<div class="shell">
  <aside class="sidebar" aria-label="Server sections">
    <nav>
      {#each links as link (link.href)}
        <a
          href="{base}{link.href}"
          aria-current={isActive(link.href) ? "page" : undefined}
        >
          {link.label}
        </a>
      {/each}
    </nav>
  </aside>

  <section class="content">
    {@render children()}
  </section>
</div>
