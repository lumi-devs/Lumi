process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-i18next/register";
import "@sapphire/plugin-utilities-store/register";


import "@sapphire/plugin-scheduled-tasks/register";

if (process.env["NODE_ENV"] !== "production") {
  await import("@sapphire/plugin-hmr/register");
}
