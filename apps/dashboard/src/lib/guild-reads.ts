import "server-only";
import { cache } from "react";
import { rpc } from "./rpc";

export const getGuildShell = cache((guildId: string, actorId: string) =>
  rpc("guild.shell.get", { guildId, actorId }),
);

export const getGuildEntities = cache((guildId: string, actorId: string) =>
  rpc("guild.entities.get", { guildId, actorId }),
);

export const getGuildModule = cache((guildId: string, actorId: string, module: string) =>
  rpc("guild.module.get", { guildId, actorId, data: { module } }),
);

export const getGuildPanicState = cache((guildId: string, actorId: string) =>
  rpc("guild.panic.get", { guildId, actorId }),
);
