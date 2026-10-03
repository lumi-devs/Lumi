process.env["NODE_ENV"] ??= "development";

// Scheduler entry point: registers only @sapphire/plugin-scheduled-tasks.
import "@sapphire/plugin-scheduled-tasks/register";
