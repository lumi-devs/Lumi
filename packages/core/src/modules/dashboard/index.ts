import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import {
  registerGuildRpcHandlers,
  unregisterGuildRpcHandlers,
} from "./rpc/guild-rpc.js";
import {
  registerPermitsRpcHandlers,
  unregisterPermitsRpcHandlers,
} from "./rpc/permits-rpc.js";
import {
  registerCasesRpcHandlers,
  unregisterCasesRpcHandlers,
} from "./rpc/cases-rpc.js";
import {
  registerSecurityRpcHandlers,
  unregisterSecurityRpcHandlers,
} from "./rpc/security-rpc.js";
import {
  registerTempVcRpcHandlers,
  unregisterTempVcRpcHandlers,
} from "./rpc/tempvc-rpc.js";
import {
  registerAuditRpcHandlers,
  unregisterAuditRpcHandlers,
} from "./rpc/audit-rpc.js";
import {
  registerModerationRpcHandlers,
  unregisterModerationRpcHandlers,
} from "./rpc/moderation-rpc.js";

@DefineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
  short: "Web dashboard integration and RPC management endpoints.",
  endUserDataStatement:
    "Does not persistently store end-user data. Transmits ephemeral RPC requests between worker and dashboard.",
  category: "System",
})
export class DashboardModule extends Module {
  public override onLoad() {
    container.logger.info("[Dashboard] Initializing domain RPC handlers...");

    registerGuildRpcHandlers();
    registerPermitsRpcHandlers();
    registerCasesRpcHandlers();
    registerSecurityRpcHandlers();
    registerTempVcRpcHandlers();
    registerAuditRpcHandlers();
    registerModerationRpcHandlers();

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading domain RPC handlers...");

    unregisterGuildRpcHandlers();
    unregisterPermitsRpcHandlers();
    unregisterCasesRpcHandlers();
    unregisterSecurityRpcHandlers();
    unregisterTempVcRpcHandlers();
    unregisterAuditRpcHandlers();
    unregisterModerationRpcHandlers();

    return super.onUnload();
  }
}
