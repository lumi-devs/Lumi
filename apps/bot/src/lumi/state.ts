export type HubTab = "home" | "modules" | "permissions" | "settings" | "addons";

export type AddonsView = "dashboard" | "repos" | "installed" | "browse";

export interface HubState {
  tab: HubTab;
  modulesPage: number;
  moduleName?: string | undefined;
  /** Channel the panel was opened in; channel permit rules are evaluated against it. */
  channelId?: string | undefined;
  permissionsPage: number;
  orderPage: number;
  explainUserId?: string | undefined;
  explainNode?: string | undefined;
  explainPage: number;
  addonsView: AddonsView;
  addonRepoName?: string | undefined;
  addonPage: number;
}

export function initialState(): HubState {
  return {
    tab: "home",
    modulesPage: 0,
    permissionsPage: 0,
    orderPage: 0,
    explainPage: 0,
    addonsView: "dashboard",
    addonPage: 0,
  };
}

export const HubId = {
  tab: (tab: HubTab): string => `lumi:tab:${tab}`,
  moduleOpen: (name: string, page: number): string => `lumi:module:open:${name}:${page}`,
  moduleBack: (page: number): string => `lumi:module:back:${page}`,
  moduleToggle: (name: string, page: number): string => `lumi:module:toggle:${name}:${page}`,
  moduleReset: (name: string, page: number): string => `lumi:cfg:reset:${name}:${page}`,
  moduleBool: (name: string, key: string, page: number): string =>
    `lumi:cfg:bool:${name}:${key}:${page}`,
  moduleChannel: (name: string, key: string, page: number): string =>
    `lumi:cfg:channel:${name}:${key}:${page}`,
  moduleRole: (name: string, key: string, page: number): string =>
    `lumi:cfg:role:${name}:${key}:${page}`,
  moduleEdit: (name: string, key: string, page: number): string =>
    `lumi:cfg:edit:${name}:${key}:${page}`,
  permissionsPage: "lumi:permpage",
  permitOrderPage: "lumi:permorderpage",
  permitOrder: (page: number): string => `lumi:permorder:${page}`,
  permitMove: (id: number, direction: "up" | "down"): string => `lumi:permmove:${id}|${direction}`,
  permitDelete: (id: number, targetType: "user" | "role" | "channel", targetId: string): string =>
    `lumi:permdel:${id}|${targetType}|${targetId}`,
  permitGrant: (kind: "custom" | "enforced"): string => `lumi:permit:grant:${kind}`,
  permitPick: (kind: "custom" | "enforced"): string => `lumi:permitpick:${kind}`,
  permitAssign: (permitId: number): string => `lumi:permitassign:${permitId}`,
  explain: "lumi:permexplain",
  explainUser: "lumi:permexplainuser",
  explainNode: (userId: string): string => `lumi:permexplainnode:${userId}`,
  explainPage: (userId: string): string => `lumi:permexplainnodepage:${userId}`,
  prefixSet: "lumi:prefix:set",
  prefixReset: "lumi:prefix:reset",
  updateAll: "lumi:addons:updateall",
  addonsView: (view: AddonsView): string => `lumi:addons:${view}`,
  addonAddRepo: "lumi:addon:addrepo",
  addonRemoveRepo: "lumi:addon:rmrepo",
  addonUpdateRepo: (name: string): string => `lumi:addon:update:${name}`,
  addonUninstall: (name: string): string => `lumi:addon:uninstall:${name}`,
  addonBrowse: (name: string): string => `lumi:addon:browse:${name}`,
  addonBrowsePage: (name: string): string => `lumi:addon:browsepage:${name}`,
  addonInstall: (repo: string, module: string): string => `lumi:addon:install:${repo}:${module}`,
  addonInfo: (repo: string, module: string): string => `lumi:addon:info:${repo}:${module}`,
  addonModal: (action: "add" | "remove", messageId: string): string =>
    `lumi:addon:modal:${action}:${messageId}`,
} as const;
