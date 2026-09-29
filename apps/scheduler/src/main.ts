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

// `installSchedulerContainerServices()` only resolves once the scheduler
// lock is confirmed held; losing it afterwards calls `process.exit(1)`
// (see `scheduler-container-services.ts`) rather than flipping a flag this
// process would still be alive to report on `/readyz` - so "we got this far"
// is the whole check.
registerSchedulerReadinessProbe(() => true);

container.logger.info("[Scheduler] Bootstrap successful - running BullMQ scheduling");
