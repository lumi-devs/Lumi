import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";
import { rpcActionCount, rpcGroups } from "@/lib/rpc-actions";

export const metadata: Metadata = {
  title: "RPC Reference",
  description: "Every dashboard-to-worker RPC action, grouped with its payload.",
};

const envelope = `// POST <worker>/rpc  (RPC_INTERNAL_TOKEN bearer)
{
  "id": "req-001",
  "action": "guild.config.set",
  "guildId": "123456789012345678",
  "actorId": "987654321098765432",
  "data": { "moduleName": "greeter", "key": "message", "value": "Hi!" }
}`;

export default function RpcPage() {
  return (
    <DocPage
      title="RPC Reference"
      lede={`The dashboard never touches Postgres, Redis, or the bot token. It posts one of ${rpcActionCount} actions to the worker's internal RPC server, and the worker executes it.`}
      path="/rpc"
    >
      <h2>Envelope</h2>
      <p>
        Every call carries <code>id</code>, <code>action</code>, optional <code>guildId</code> and{" "}
        <code>actorId</code>, an optional W3C <code>traceparent</code> so the handler continues
        the caller&apos;s trace, and <code>data</code>. The contract lives in{" "}
        <code>packages/contracts/src/rpc.ts</code>: <code>RpcRequestPayloads</code> maps each wire
        action string to its <code>data</code> payload, where <code>none</code> below means the
        contract types the payload as <code>never</code>. Responses are checked with{" "}
        <code>parseRpcResponse</code>, which rejects malformed envelopes — the two sides deploy
        independently, so the envelope is the one shape TypeScript cannot guarantee.
      </p>
      <CodeBlock code={envelope} language="json" title="Request envelope" />

      {rpcGroups.map((group) => (
        <section key={group.title}>
          <h2>
            {group.title}{" "}
            <span className="font-mono text-[13px] font-medium" style={{ color: "var(--fg-faint)" }}>
              ({group.actions.length})
            </span>
          </h2>
          <p style={{ color: "var(--fg-muted)" }}>{group.note}</p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Payload</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {group.actions.map((action) => (
                  <tr key={action.name}>
                    <td>
                      <code>{action.name}</code>
                    </td>
                    <td style={{ color: "var(--fg-muted)" }}>
                      <code>{action.payload}</code>
                    </td>
                    <td>{action.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </DocPage>
  );
}
