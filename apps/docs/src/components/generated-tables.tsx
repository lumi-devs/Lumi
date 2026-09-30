import defaultMdxComponents from "fumadocs-ui/mdx";

const Table = defaultMdxComponents.table;
import { workerEnvVars, dashboardEnvVars, observabilityEnvVars, composeEnvVars } from "@/generated/env-vars";
import { commandGroups, commandCount } from "@/generated/commands";
import { permitNodeGroups, permitNodeCount } from "@/generated/permits";
import { rpcActionCount, rpcSliceGroups } from "@/generated/rpc-actions";
import { dataPrivacyRows } from "@/generated/data-privacy";
import { sdkImportGroups, sdkExportCount } from "@/generated/sdk-reference";

function EnvRows({ rows }: { rows: { name: string; required: string; fallback: string; about: string }[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Variable</th>
          <th>Required</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>{row.required}</td>
            <td>
              <code>{row.fallback}</code>
            </td>
            <td>{row.about}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function WorkerEnvTable() {
  return <EnvRows rows={workerEnvVars} />;
}

export function DashboardEnvTable() {
  return <EnvRows rows={dashboardEnvVars} />;
}

export function ObservabilityEnvTable() {
  return <EnvRows rows={observabilityEnvVars} />;
}

export function ComposeEnvTable() {
  return <EnvRows rows={composeEnvVars} />;
}

export function CommandsTable() {
  return (
    <>
      {commandGroups.map((group) => (
        <div key={group.module}>
          <h3>
            {group.emoji} {group.displayName}
          </h3>
          <Table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Permit</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {group.commands.map((cmd) => (
                <tr key={cmd.name}>
                  <td>
                    <code>
                      /{cmd.name}
                      {cmd.subcommands.length > 0 ? ` <${cmd.subcommands.join("|")}>` : ""}
                    </code>
                  </td>
                  <td>{cmd.requiredPermit ? <code>{cmd.requiredPermit}</code> : "—"}</td>
                  <td>{cmd.description}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
    </>
  );
}

export function CommandCount() {
  return <>{commandCount}</>;
}

export function PermitsTable() {
  return (
    <>
      {permitNodeGroups.map((group) => (
        <div key={group.prefix}>
          <h3>
            <code>{group.prefix}.*</code>
          </h3>
          <ul>
            {group.nodes.map((node) => (
              <li key={node}>
                <code>{node}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function PermitCount() {
  return <>{permitNodeCount}</>;
}

export function RpcCount() {
  return <>{rpcActionCount}</>;
}

export function RpcSliceTables() {
  return (
    <>
      {rpcSliceGroups.map((group) => (
        <div key={group.slice}>
          <h3>{group.slice}</h3>
          <Table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Auth</th>
                <th>Timeout</th>
                <th>Requires module</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {group.actions.map((action) => (
                <tr key={action.name}>
                  <td>
                    <code>{action.name}</code>
                  </td>
                  <td>
                    <code>{action.auth}</code>
                  </td>
                  <td>{action.timeoutMs}ms</td>
                  <td>{action.requiresEnabled ? <code>{action.requiresEnabled}</code> : "—"}</td>
                  <td>{action.summary}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
    </>
  );
}

export function SdkExportCount() {
  return <>{sdkExportCount}</>;
}

export function SdkReferenceSections() {
  return (
    <>
      {sdkImportGroups.map((group) => (
        <div key={group.importPath}>
          <h2>
            <code>{group.importPath}</code>
          </h2>
          {group.exports.map((entry) => (
            <div key={entry.name}>
              <h3>
                <code>{entry.name}</code> <em>{entry.kind}</em>
              </h3>
              {entry.summary ? <p>{entry.summary}</p> : null}
              <pre>
                <code>{entry.signature}</code>
              </pre>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function DataPrivacyTable() {
  return (
    <Table>
      <thead>
        <tr>
          <th>Module</th>
          <th>End-user data statement</th>
        </tr>
      </thead>
      <tbody>
        {dataPrivacyRows.map((row) => (
          <tr key={row.name}>
            <td>{row.displayName}</td>
            <td>{row.statement ?? <em>Not stated in this module&apos;s manifest.</em>}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
