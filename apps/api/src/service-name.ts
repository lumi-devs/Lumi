// Set the telemetry service name before the worker's bootstrap reads it (the
// api boots the full worker until the real split).
process.env["SERVICE_NAME"] ??= "api";
