import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Administer Lumi from the web: auth, guild pages, and the RPC bridge.",
};

const devRun = `bun run --cwd apps/dashboard dev   # http://localhost:8080`;

const callback = `<dashboard-origin>/api/auth/callback/discord`;

export default function DashboardPage() {
  return (
    <DocPage
      title="Dashboard"
      lede="A Next.js App Router panel that administers the bot without ever holding its token or touching its database."
      path="/dashboard"
    >
      <h2>What it is</h2>
      <p>
        <code>apps/dashboard</code> is a from-scratch Next.js rewrite of an earlier hand-rolled
        SSR app. The architecture piece that did not change: every read and write is proxied
        over the internal HTTP RPC bridge to the worker (<code>apps/dashboard/src/lib/rpc.ts</code>,
        a <code>server-only</code> module reachable only from Server Components, Route Handlers,
        and Server Actions). The dashboard needs three things to run: its session secret, Discord
        OAuth2 credentials, and the worker RPC address — see{" "}
        <a href="/configuration">Configuration</a>.
      </p>
      <CodeBlock code={devRun} language="bash" title="Local dev" />

      <h2>Authentication</h2>
      <p>
        Sign-in is Discord OAuth2 via NextAuth v5; the session is a JWT encrypted with{" "}
        <code>DASHBOARD_SESSION_SECRET</code>. Whether the signed-in user is a bot owner is not a
        dashboard-side list — it comes from the <code>auth.whoami</code> RPC, which defers to the
        worker&apos;s permit resolver (<code>OWNER_IDS</code> plus the Discord application&apos;s
        actual owner). Owner status and the manageable-guild list are re-derived at most every
        five minutes. Register the callback URL on your Discord application:
      </p>
      <CodeBlock code={callback} language="text" title="OAuth2 redirect" />
      <p>
        Behind a reverse proxy that rewrites Host, set <code>AUTH_URL</code> to the externally
        visible origin. There is no secure-cookie variable — NextAuth picks the{" "}
        <code>__Secure-</code> prefix from the resolved scheme.
      </p>

      <h2>Security model</h2>
      <ul>
        <li>
          <strong>IDOR guard:</strong> <code>authorizedGuild()</code> is re-checked on every
          guild-scoped page render and every guild-scoped Server Action — never trusted from
          client state.
        </li>
        <li>
          <strong>CSP in middleware, not config:</strong> Next only nonces its inline flight
          scripts when it reads the policy off the incoming request, so the{" "}
          <code>content-security-policy</code> header is set in <code>src/middleware.ts</code>. A
          strict policy in <code>next.config.ts</code> would block hydration.
        </li>
        <li>
          <strong>CSRF:</strong> Server Actions&apos; built-in same-origin check — no hand-rolled
          token system.
        </li>
        <li>
          <strong>Headers:</strong> <code>X-Content-Type-Options</code>,{" "}
          <code>X-Frame-Options</code>, <code>Referrer-Policy</code>,{" "}
          <code>Strict-Transport-Security</code>, and <code>Permissions-Policy</code> from the
          Next config.
        </li>
      </ul>

      <h2>Routes and data flow</h2>
      <p>
        Routes cover a landing page, <code>/login</code>, per-guild administration under{" "}
        <code>/guild/[guildId]/*</code> (overview, module grid, per-module settings forms,
        moderation, safety, history), and the bot-owner <code>/system/*</code> panel. Guild pages
        fetch through React-cache-deduped RPC readers; mutations are Server Actions, one file per
        domain (guild, moderation, security, tempvc, overrides, history, blocklist, advanced,
        system, user, auth). The patterns to copy for a new route are the module toggle grid and
        the dynamic per-module form with its floating save bar.
      </p>

      <h2>Adding a capability</h2>
      <p>Dashboard features always land in three places, never as a direct database call:</p>
      <ul>
        <li>
          A new entry in <code>RpcRequestPayloads</code> in{" "}
          <code>packages/contracts/src/rpc.ts</code>.
        </li>
        <li>
          A handler in <code>packages/core/src/lib/rpc/core-rpc.ts</code> on the worker side.
        </li>
        <li>
          A caller in <code>apps/dashboard/src/lib/dashboard-fetch.ts</code> for reads, or{" "}
          <code>apps/dashboard/src/actions/*</code> for mutations.
        </li>
      </ul>
    </DocPage>
  );
}
