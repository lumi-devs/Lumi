import { describe, it, expect } from "bun:test";
import {
  buildAddonsView,
  buildAddonReposView,
  buildRepoUpdateConfirmView,
  buildAddonInstalledView,
  buildAddonRepoModulesView,
  buildAutoUpdateSettingsView,
} from "@lumi/modules/core/ui/addons.js";

describe("Addons UI Panel Builders", () => {
  it("builds main add-ons overview with pending updates and without", () => {
    const withoutUpdates = buildAddonsView({
      repoCount: 2,
      installedCount: 5,
      pendingUpdates: [],
    });
    expect(withoutUpdates.components).toBeDefined();
    expect(withoutUpdates.components.length).toBeGreaterThan(0);

    const withUpdates = buildAddonsView({
      repoCount: 3,
      installedCount: 7,
      pendingUpdates: ["mod-a", "mod-b"],
    });
    expect(withUpdates.components).toBeDefined();
  });

  it("builds tracked repositories view with and without repos", () => {
    const emptyView = buildAddonReposView([]);
    expect(emptyView.components).toBeDefined();

    const withRepos = buildAddonReposView([
      {
        name: "community-repo",
        url: "https://github.com/example/community-repo",
        branch: "main",
        installedCount: 3,
        commit: "abcdef123456",
      },
    ]);
    expect(withRepos.components).toBeDefined();
  });

  it("builds repository update confirmation view", () => {
    const confirmView = buildRepoUpdateConfirmView(
      "community-repo",
      "Fixed music playback issue\nAdded new filters",
    );
    expect(confirmView.components).toBeDefined();
  });

  it("builds installed add-ons list view with repositories dropdown", () => {
    const installedView = buildAddonInstalledView(
      [
        {
          moduleName: "music-bot",
          repoName: "community-repo",
          installedAt: new Date(Date.now() - 3600000),
          enabled: true,
          version: "1.2.0",
        },
        {
          moduleName: "leveling",
          repoName: "community-repo",
          installedAt: new Date(Date.now() - 7200000),
          enabled: false,
          version: "0.9.1",
        },
      ],
      [{ name: "community-repo" }, { name: "official-addons" }],
    );
    expect(installedView.components).toBeDefined();
  });

  it("builds repository browsable modules view with pagination", () => {
    const modules = [
      {
        name: "trivia",
        short: "Play trivia games",
        version: "1.0.0",
        isInstalled: true,
        hidden: false,
      },
      {
        name: "rpg",
        description: "Full RPG mechanics with inventory and leveling",
        version: "2.1.0",
        isInstalled: false,
        hidden: false,
        endUserDataStatement: "Stores player inventory and level",
      },
      {
        name: "secret-admin",
        version: "0.0.1",
        isInstalled: false,
        hidden: true, // Should be filtered out
      },
    ];

    const view = buildAddonRepoModulesView("game-pack", modules, 0);
    expect(view.components).toBeDefined();
  });

  it("builds auto-update settings view with enabled and disabled states", () => {
    const enabledView = buildAutoUpdateSettingsView({
      enabled: true,
      intervalMinutes: 60,
    });
    expect(enabledView.components).toBeDefined();

    const disabledView = buildAutoUpdateSettingsView({
      enabled: false,
      intervalMinutes: 1440,
    });
    expect(disabledView.components).toBeDefined();
  });
});
