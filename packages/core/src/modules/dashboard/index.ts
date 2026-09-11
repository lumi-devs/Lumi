import {
  Module,
  DefineModule,
  NoEndUserData,
} from "#lib/module-system/Module.js";
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
  registerReactionRolesRpcHandlers,
  unregisterReactionRolesRpcHandlers,
} from "./rpc/reactionroles-rpc.js";
import {
  registerAuditRpcHandlers,
  unregisterAuditRpcHandlers,
} from "./rpc/audit-rpc.js";
import {
  registerModerationRpcHandlers,
  unregisterModerationRpcHandlers,
} from "./rpc/moderation-rpc.js";
import {
  registerLoggingRpcHandlers,
  unregisterLoggingRpcHandlers,
} from "./rpc/logging-rpc.js";
import {
  registerWelcomeRpcHandlers,
  unregisterWelcomeRpcHandlers,
} from "./rpc/welcome-rpc.js";

const RpcHandlerSets = [
  { register: registerGuildRpcHandlers, unregister: unregisterGuildRpcHandlers },
  { register: registerPermitsRpcHandlers, unregister: unregisterPermitsRpcHandlers },
  { register: registerCasesRpcHandlers, unregister: unregisterCasesRpcHandlers },
  { register: registerSecurityRpcHandlers, unregister: unregisterSecurityRpcHandlers },
  { register: registerTempVcRpcHandlers, unregister: unregisterTempVcRpcHandlers },
  {
    register: registerReactionRolesRpcHandlers,
    unregister: unregisterReactionRolesRpcHandlers,
  },
  { register: registerAuditRpcHandlers, unregister: unregisterAuditRpcHandlers },
  {
    register: registerModerationRpcHandlers,
    unregister: unregisterModerationRpcHandlers,
  },
  { register: registerLoggingRpcHandlers, unregister: unregisterLoggingRpcHandlers },
  { register: registerWelcomeRpcHandlers, unregister: unregisterWelcomeRpcHandlers },
];

@DefineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
  short: "Web dashboard integration and RPC management endpoints.",
  endUserDataStatement: NoEndUserData(),
  category: "System",
})
export class DashboardModule extends Module {
  public override onLoad() {
    container.logger.info("[Dashboard] Initializing domain RPC handlers...");

    for (const set of RpcHandlerSets) set.register();

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading domain RPC handlers...");

    for (const set of RpcHandlerSets) set.unregister();

    return super.onUnload();
  }
}
