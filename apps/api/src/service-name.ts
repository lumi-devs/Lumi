// Set the telemetry service name before the worker's bootstrap reads it (the
// api boots the full worker until the real split — Part II, S2/S5).
process.env["SERVICE_NAME"] ??= "api";
