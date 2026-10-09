import "./telemetry.js";
import {
  bootstrapSchedulerApp,
  registerInfrastructureReadinessProbes,
  registerSchedulerReadinessProbe,
} from "@lumi/core";
import { container } from "#lib/services.js";

await bootstrapSchedulerApp();

registerInfrastructureReadinessProbes();

// Bootstrapping confirms lock acquisition; losing the lock triggers process exit.
registerSchedulerReadinessProbe(() => true);

container.logger.info("[Scheduler] Bootstrap successful - running BullMQ scheduling");
