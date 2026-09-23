import { defineCustomId } from "#lib/interactions/custom-id.js";

export const PingId = defineCustomId("ping", ["cat", "userId"]);

export const ModuleUpdateId = defineCustomId("module:update", [
  "moduleName",
  "userId",
]);
export const ModuleRestartId = defineCustomId("module:restart", ["userId"]);
export const ModuleRestartCancelId = defineCustomId("module:restartcancel", [
  "userId",
]);

export const ConfigButtonId = defineCustomId(
  "cfg",
  ["action", "moduleName"],
  { tail: "rest" },
);
export const ConfigSelectId = defineCustomId(
  "cfg",
  ["action", "moduleName"],
  { tail: "rest" },
);
export const ConfigModalId = defineCustomId("cfg:modal", ["moduleName"]);
export const ConfigOverrideModalId = defineCustomId("cfg:ovmodal", [
  "moduleName",
]);
export const ConfigFieldModalId = defineCustomId("cfg:fmodal", [
  "moduleName",
  "fieldKey",
  "fieldPage",
]);

export const HubId = defineCustomId("lumi", ["action"], { tail: "rest" });
export const HubPermitPickId = defineCustomId("lumi:permit:pick", ["kind"]);
export const HubPermitAssignId = defineCustomId("lumi:permit:assign", [
  "permitId",
]);
export const HubAddonModActionId = defineCustomId(
  "lumi:addon:mod_action",
  [],
  { tail: "rest" },
);
export const HubAddonModalId = defineCustomId("lumi:addonmodal", ["action"]);

export const SetupId = defineCustomId("setup", ["head"], { tail: "rest" });
export const SetupStepId = defineCustomId("setup:step", [], {
  tail: "segments",
});
export const SetupAgeModalId = defineCustomId("setup:agemodal", [], {
  tail: "segments",
});
