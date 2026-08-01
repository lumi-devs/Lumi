import { FT, T } from "#lib/i18n/keys/types.js";

/** `panels:` keys shared by every paginated panel: back buttons and page controls. */
export const NavigationPanelKeys = {
  Back: T("panels:back"),
  BackToHub: T("panels:backToHub"),
  BackToAddons: T("panels:backToAddons"),
  BackToRepos: T("panels:backToRepos"),
  BackToModules: T("panels:backToModules"),
  BackToFeature: T("panels:backToFeature"),
  PagePrev: T("panels:pagePrev"),
  PageNext: T("panels:pageNext"),
  PageIndicator: FT<{ page: number; total: number }>("panels:pageIndicator"),
} as const;
