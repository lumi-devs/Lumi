// Runs before @lumi/worker/main (which imports @lumi/core/setup). The api app
// is a thin stub that boots the full worker until the real service split, so it
// only stamps SERVICE_NAME for telemetry; LUMI_ROLE stays env-driven (worker in
// the scale-out compose profile).
process.env["SERVICE_NAME"] ??= "api";
