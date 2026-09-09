import { fileURLToPath } from "node:url";
import { container } from "@sapphire/framework";
import { GuildMember } from "discord.js";
import type { MessageComponentInteraction, ModalSubmitInteraction, User } from "discord.js";
import type {
  AddonCapabilities,
  AddonCommandDescriptor,
  AddonInvocation,
  AddonRpcRequest,
  AddonRpcResponse,
  SerialisedMember,
  SerialisedUser,
  ChildToHost,
  HostToChild,
} from "@lumi/contracts";
import type { ModuleRecord } from "#lib/module-system/ModuleStore.js";
import type { CommandContext } from "#lib/command-context.js";
import { isMethodAllowed, parseCapabilities } from "./capabilities.js";
import { callHostMethod, type HostCallScope } from "./host-methods.js";
import { ensureSandboxRoot } from "./sandbox-root.js";

const ChildEntry = fileURLToPath(new URL("../../runtime/addon-child.ts", import.meta.url));

const ReadyTimeoutMs = 15_000;
const InvocationTimeoutMs = 30_000;
const CrashLoopWindowMs = 60_000;

// Allowlist, not a denylist: a denylist silently leaks whatever secret is
// added to .env next.
const InheritedEnvKeys = ["PATH", "HOME", "TZ", "LANG", "LC_ALL", "NODE_ENV"];

export function childEnv(record: Pick<ModuleRecord, "name" | "dir">): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of InheritedEnvKeys) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.LUMI_ADDON_NAME = record.name;
  env.LUMI_ADDON_DIR = record.dir;
  return env;
}

// Constrained host-side: an addon declaring "" would be handed every button,
// select and modal submit in the bot, core modules' included.
export function ownPrefixes(addonName: string, declared: string[]): string[] {
  const required = `${addonName}:`;
  const rejected = declared.filter((p) => !p.startsWith(required));
  if (rejected.length > 0) {
    container.logger.error(
      `[AddonHost] ${addonName} declared interaction prefixes outside its own namespace; ignoring ${rejected.map((p) => JSON.stringify(p)).join(", ")}`,
    );
  }
  return declared.filter((p) => p.startsWith(required));
}

function serialiseUser(user: User): SerialisedUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bot: user.bot,
    avatarUrl: user.displayAvatarURL(),
  };
}

function serialiseMember(member: GuildMember | null): SerialisedMember | null {
  if (!member) return null;
  return {
    id: member.id,
    nickname: member.nickname,
    roles: [...member.roles.cache.keys()],
    joinedTimestamp: member.joinedTimestamp,
    permissions: member.permissions.bitfield.toString(),
  };
}

function serialiseModalFields(interaction: ModalSubmitInteraction): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [customId, field] of interaction.fields.fields) {
    if ("value" in field && typeof field.value === "string") fields[customId] = field.value;
  }
  return fields;
}

interface PendingInvocation {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  scope: Pick<HostCallScope, "ctx" | "interaction" | "guildId">;
}

class AddonProcess {
  readonly capabilities: AddonCapabilities;
  commands: AddonCommandDescriptor[] = [];
  interactionPrefixes: string[] = [];
  tasks: string[] = [];

  #proc: Bun.Subprocess;
  #pending = new Map<string, PendingInvocation>();
  #ready: Promise<AddonCommandDescriptor[]>;
  #resolveReady!: (commands: AddonCommandDescriptor[]) => void;
  #rejectReady!: (err: Error) => void;
  #seq = 0;

  constructor(
    readonly record: ModuleRecord,
    private readonly onExit: (proc: AddonProcess, code: number | null) => void,
  ) {
    this.capabilities = parseCapabilities(
      (record.manifest as { capabilities?: unknown } | undefined)?.capabilities,
    );

    this.#ready = new Promise<AddonCommandDescriptor[]>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });
    const readyTimer = setTimeout(
      () => this.#rejectReady(new Error(`Addon "${record.name}" did not report ready in time`)),
      ReadyTimeoutMs,
    );
    void this.#ready.catch(() => undefined).finally(() => clearTimeout(readyTimer));

    this.#proc = Bun.spawn({
      cmd: [process.execPath, ChildEntry],
      cwd: record.dir,
      env: childEnv(record),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ipc: (message: ChildToHost) => void this.#onMessage(message),
      onExit: (_proc, exitCode) => this.#onExit(exitCode),
    });

    void this.#pipe(this.#proc.stdout, "info");
    void this.#pipe(this.#proc.stderr, "warn");
  }

  async #pipe(stream: ReadableStream<Uint8Array> | number | undefined, level: "info" | "warn") {
    if (!stream || typeof stream === "number") return;
    for await (const chunk of stream) {
      const text = Buffer.from(chunk).toString().trimEnd();
      if (text) container.logger[level](`[addon:${this.record.name}] ${text}`);
    }
  }

  ready(): Promise<AddonCommandDescriptor[]> {
    return this.#ready;
  }

  #onExit(code: number | null): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Addon "${this.record.name}" exited mid-invocation`));
    }
    this.#pending.clear();
    this.#rejectReady(new Error(`Addon "${this.record.name}" exited before reporting ready`));
    this.onExit(this, code);
  }

  async #onMessage(raw: ChildToHost): Promise<void> {
    switch (raw.type) {
      case "ready":
        this.commands = raw.commands;
        this.interactionPrefixes = ownPrefixes(this.record.name, raw.interactionPrefixes);
        this.tasks = raw.tasks;
        this.#resolveReady(raw.commands);
        return;
      case "load-failed":
        this.#rejectReady(new Error(raw.error));
        return;
      case "rpc-request":
        this.#send({ type: "rpc-response", response: await this.#dispatch(raw.request) });
        return;
      case "invocation-done": {
        const pending = this.#pending.get(raw.invocationId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#pending.delete(raw.invocationId);
        if (raw.error) pending.reject(new Error(raw.error));
        else pending.resolve();
      }
    }
  }

  async #dispatch(request: AddonRpcRequest): Promise<AddonRpcResponse> {
    if (!isMethodAllowed(request.action, this.capabilities)) {
      return {
        id: request.id,
        ok: false,
        error: `Addon "${this.record.name}" lacks the capability for "${request.action}"`,
      };
    }
    const scope = request.invocationId
      ? this.#pending.get(request.invocationId)?.scope
      : undefined;
    try {
      return {
        id: request.id,
        ok: true,
        data: await callHostMethod(request, { moduleName: this.record.name, ...scope }),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      container.logger.warn(`[addon:${this.record.name}] ${request.action} failed: ${message}`);
      return { id: request.id, ok: false, error: message };
    }
  }


  nextInvocationId(): string {
    return `${this.record.name}:${++this.#seq}`;
  }

  invoke(
    invocation: AddonInvocation,
    scope: Pick<HostCallScope, "ctx" | "interaction" | "guildId"> = {},
  ): Promise<void> {
    const { invocationId } = invocation;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(invocationId);
        reject(
          new Error(`Addon "${this.record.name}" timed out running "${invocation.piece}"`),
        );
        this.kill();
      }, InvocationTimeoutMs);
      this.#pending.set(invocationId, { resolve, reject, timer, scope });
      this.#send({ type: "invoke", invocation });
    });
  }

  #send(message: HostToChild): void {
    if (this.#proc.exitCode === null) this.#proc.send(message);
  }

  kill(): void {
    this.#send({ type: "shutdown" });
    this.#proc.kill();
  }
}

export class AddonHost {
  onRespawn?: (record: ModuleRecord, commands: AddonCommandDescriptor[]) => void;
  onFailed?: (record: ModuleRecord) => void;

  #processes = new Map<string, AddonProcess>();
  #lastCrash = new Map<string, number>();
  #rootReady: Promise<void> | null = null;

  async start(record: ModuleRecord): Promise<AddonCommandDescriptor[]> {
    this.#rootReady ??= ensureSandboxRoot();
    await this.#rootReady;

    this.stop(record.name);
    const proc = new AddonProcess(record, (p, code) => this.#onExit(p, code));
    this.#processes.set(record.name, proc);
    try {
      return await proc.ready();
    } catch (err) {
      this.#processes.delete(record.name);
      proc.kill();
      throw err;
    }
  }

  stop(name: string): void {
    const proc = this.#processes.get(name);
    if (!proc) return;
    this.#processes.delete(name);
    proc.kill();
  }

  isRunning(name: string): boolean {
    return this.#processes.has(name);
  }

  commandsFor(name: string): AddonCommandDescriptor[] {
    return this.#processes.get(name)?.commands ?? [];
  }

  invokeCommand(name: string, piece: string, ctx: CommandContext): Promise<void> {
    const proc = this.#require(name);
    return proc.invoke(
      {
        kind: "command",
        invocationId: proc.nextInvocationId(),
        piece,
        guildId: ctx.guildId,
        channelId: ctx.channelId,
        isSlash: ctx.isSlash,
        subcommand: ctx.isSlash ? ctx.interaction.options.getSubcommand(false) : null,
        user: serialiseUser(ctx.user),
        member: serialiseMember(ctx.member),
      },
      { ctx, guildId: ctx.guildId },
    );
  }

  ownerOfCustomId(customId: string): string | null {
    for (const [name, proc] of this.#processes) {
      if (proc.interactionPrefixes.some((prefix) => customId.startsWith(prefix))) {
        return name;
      }
    }
    return null;
  }

  invokeInteraction(
    name: string,
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
  ): Promise<void> {
    const proc = this.#require(name);
    return proc.invoke(
      {
        kind: "interaction",
        invocationId: proc.nextInvocationId(),
        piece: interaction.customId,
        guildId: interaction.guildId,
        channelId: interaction.channelId ?? "",
        customId: interaction.customId,
        user: serialiseUser(interaction.user),
        member: serialiseMember(
          interaction.member instanceof GuildMember ? interaction.member : null,
        ),
        values: interaction.isStringSelectMenu() ? interaction.values : [],
        fields: interaction.isModalSubmit() ? serialiseModalFields(interaction) : {},
      },
      { interaction, guildId: interaction.guildId },
    );
  }

  fireTask(name: string, task: string, payload: Record<string, unknown>): Promise<void> {
    const proc = this.#require(name);
    const guildId = typeof payload.guildId === "string" ? payload.guildId : null;
    return proc.invoke(
      {
        kind: "task-fire",
        invocationId: proc.nextInvocationId(),
        piece: task,
        guildId,
        task,
        payload,
      },
      { guildId },
    );
  }

  #require(name: string): AddonProcess {
    const proc = this.#processes.get(name);
    if (!proc) throw new Error(`Addon "${name}" is not running`);
    return proc;
  }

  #onExit(proc: AddonProcess, code: number | null): void {
    const { name } = proc.record;
    if (this.#processes.get(name) !== proc) return;
    this.#processes.delete(name);

    const now = Date.now();
    const previous = this.#lastCrash.get(name) ?? 0;
    this.#lastCrash.set(name, now);

    if (now - previous < CrashLoopWindowMs) {
      this.#markFailed(proc.record, `Crashed twice within ${CrashLoopWindowMs / 1000}s (exit ${code})`);
      container.logger.error(`[AddonHost] ${name} crash-looping; leaving it failed`);
      return;
    }

    container.logger.warn(`[AddonHost] ${name} exited (${code}); respawning once`);
    void this.start(proc.record).then(
      (commands) => this.onRespawn?.(proc.record, commands),
      (err: unknown) => this.#markFailed(proc.record, err instanceof Error ? err.message : String(err)),
    );
  }

  #markFailed(record: ModuleRecord, reason: string): void {
    record.state = "failed";
    record.enabled = false;
    record.failureReason = reason;
    this.onFailed?.(record);
  }
}
