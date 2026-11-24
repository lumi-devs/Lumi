import { describe, expect, it, vi } from "vitest";
import { createOwnerCommands } from "../../src/core/ownerCommands.js";

describe("Owner Commands — Reload & Autocomplete", () => {
  it("defines the reload subcommand with autocomplete", () => {
    const commands = createOwnerCommands({
      client: {} as any,
      prisma: {} as any,
      cache: {} as any,
      configService: {} as any,
      dataLifecycle: {} as any,
      errorStore: {} as any,
      listModules: () => ["confessions", "activity-roles", "moderation"],
      reloadModule: vi.fn(),
    });

    expect(commands).toHaveLength(1);
    const ownerCmd = commands[0]!;
    expect(ownerCmd.ownerOnly).toBe(true);

    const json = ownerCmd.data.toJSON() as any;
    expect(json.name).toBe("owner");
    const reloadSub = json.options.find((opt: any) => opt.name === "reload");
    expect(reloadSub).toBeDefined();
    expect(reloadSub.options[0].name).toBe("module");
    expect(reloadSub.options[0].autocomplete).toBe(true);
  });

  it("autocompletes matching modules", async () => {
    const commands = createOwnerCommands({
      client: {} as any,
      prisma: {} as any,
      cache: {} as any,
      configService: {} as any,
      dataLifecycle: {} as any,
      errorStore: {} as any,
      listModules: () => ["confessions", "activity-roles", "moderation"],
    });

    const ownerCmd = commands[0]!;
    expect(ownerCmd.autocomplete).toBeDefined();

    const respond = vi.fn();
    const interaction = {
      options: {
        getFocused: () => "conf",
      },
      respond,
    };

    await ownerCmd.autocomplete!(interaction as any, {} as any);
    expect(respond).toHaveBeenCalledWith([{ name: "confessions", value: "confessions" }]);
  });

  it("executes reload subcommand successfully", async () => {
    const reloadModule = vi.fn().mockResolvedValue(undefined);
    const commands = createOwnerCommands({
      client: {} as any,
      prisma: {} as any,
      cache: {} as any,
      configService: {} as any,
      dataLifecycle: {} as any,
      errorStore: {} as any,
      reloadModule,
    });

    const ownerCmd = commands[0]!;
    const deferReply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);

    const interaction = {
      options: {
        getSubcommand: () => "reload",
        getString: (name: string) => (name === "module" ? "confessions" : null),
      },
      deferReply,
      editReply,
    };

    await ownerCmd.execute(interaction as any, {} as any);
    expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(reloadModule).toHaveBeenCalledWith("confessions");
    expect(editReply).toHaveBeenCalled();
  });
});
