export type MemberAction =
  | "kick"
  | "trust"
  | "untrust"
  | "block"
  | "unblock"
  | "transfer";

export const TempVcIds = {
  panel: (channelId: string) => `tempvc:panel:${channelId}`,
  refresh: (channelId: string) => `tempvc:refresh:${channelId}`,
  claim: (channelId: string) => `tempvc:claim:${channelId}`,
  delete: (channelId: string) => `tempvc:delete:${channelId}`,
  modalRename: (channelId: string) => `tempvc:modal:rename:${channelId}`,
  modalLimit: (channelId: string) => `tempvc:modal:limit:${channelId}`,
  pick: (action: MemberAction, channelId: string) =>
    `tempvc:pick:${action}:${channelId}`,
  adminAdd: "tempvc:admin:add",
  adminPick: "tempvc:admin:pick",
  adminBack: "tempvc:admin:back",
  adminConfig: "tempvc:admin:config",
  adminRename: (generatorId: string) => `tempvc:admin:rename:${generatorId}`,
  adminLimit: (generatorId: string) => `tempvc:admin:limit:${generatorId}`,
  adminRemove: (generatorId: string) => `tempvc:admin:remove:${generatorId}`,
  adminRemoveConfirm: (generatorId: string) =>
    `tempvc:admin:removeconfirm:${generatorId}`,
  adminRemoveCancel: (generatorId: string) =>
    `tempvc:admin:removecancel:${generatorId}`,
  adminModalRename: (generatorId: string) =>
    `tempvc:admin:modal:rename:${generatorId}`,
  adminModalLimit: (generatorId: string) =>
    `tempvc:admin:modal:limit:${generatorId}`,
  cfgCategory: "tempvc:cfg:category",
  cfgEdit: "tempvc:cfg:edit",
  cfgModal: (key: string) => `tempvc:cfg:modal:${key}`,
} as const;

export const TempVcPrefixes = {
  panel: "tempvc:panel:",
  refresh: "tempvc:refresh:",
  claim: "tempvc:claim:",
  delete: "tempvc:delete:",
  modalRename: "tempvc:modal:rename:",
  modalLimit: "tempvc:modal:limit:",
  pick: "tempvc:pick:",
  admin: "tempvc:admin:",
  cfg: "tempvc:cfg:",
  adminRename: "tempvc:admin:rename:",
  adminLimit: "tempvc:admin:limit:",
  adminRemove: "tempvc:admin:remove:",
  adminRemoveConfirm: "tempvc:admin:removeconfirm:",
  adminRemoveCancel: "tempvc:admin:removecancel:",
  adminModalRename: "tempvc:admin:modal:rename:",
  adminModalLimit: "tempvc:admin:modal:limit:",
  cfgModal: "tempvc:cfg:modal:",
} as const;

export const stripPrefix = (
  customId: string,
  prefix: string,
): string | null =>
  customId.startsWith(prefix) ? customId.slice(prefix.length) : null;
