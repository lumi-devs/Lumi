import "./telemetry.js";
import "@lumi/core/setup-scheduler";
import {
  bootstrapSchedulerApp,
  registerInfrastructureReadinessProbes,
  registerSchedulerReadinessProbe,
} from "@lumi/core";
import { container } from "@sapphire/framework";

await bootstrapSchedulerApp();

registerInfrastructureReadinessProbes();

// Bootstrapping confirms lock acquisition; losing the lock triggers process exit.
registerSchedulerReadinessProbe(() => true);

container.logger.info("[Scheduler] Bootstrap successful - running BullMQ scheduling");
