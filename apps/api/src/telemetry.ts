// Must be imported first before instrumented dependencies.
import { bootstrapTelemetry } from "@lumi/observability";

// api replicas run standalone pods without shared metrics ports.
bootstrapTelemetry("api");
