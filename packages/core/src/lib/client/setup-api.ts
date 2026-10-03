process.env["NODE_ENV"] ??= "development";

// Only registers plugins required for RPC handling (@sapphire/plugin-utilities-store).
import "@sapphire/plugin-utilities-store/register";
