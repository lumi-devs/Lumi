import type { Container } from "#src/lib/Services.js";
import {
  Events,
  type Message,
  type MessageCreateOptions,
  type TextBasedChannel,
  type User,
} from "discord.js";

export interface TunnelOptions {
  timeoutMs?: number;
  header?: boolean;
}

export interface TunnelChannel {
  id: string;
  send(options: string | MessageCreateOptions): Promise<Message>;
}

const DefaultTunnelTimeoutMs = 30 * 60 * 1_000;

export class Tunnel {
  public readonly channelA: TunnelChannel;
  public readonly channelB: TunnelChannel;
  private readonly services: Container;
  private readonly userA: User;
  private readonly userB: User | null;
  private readonly header: boolean;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handler: ((message: Message) => void) | null = null;
  private done = false;

  private constructor(
    services: Container,
    userA: User,
    userB: User | null,
    channelA: TunnelChannel,
    channelB: TunnelChannel,
    header: boolean,
  ) {
    this.services = services;
    this.userA = userA;
    this.userB = userB;
    this.channelA = channelA;
    this.channelB = channelB;
    this.header = header;
  }

  public static async open(
    services: Container,
    userA: User,
    userB: User | TextBasedChannel,
    options: TunnelOptions = {},
  ): Promise<Tunnel> {
    const channelA = await userA.createDM();
    const rawB: unknown =
      "createDM" in userB ? await userB.createDM() : userB;
    if (
      typeof rawB !== "object" ||
      rawB === null ||
      typeof (rawB as TunnelChannel).send !== "function" ||
      typeof (rawB as TunnelChannel).id !== "string"
    ) {
      throw new Error("Tunnel target channel is not sendable.");
    }
    const channelB = rawB as TunnelChannel;
    const tunnel = new Tunnel(
      services,
      userA,
      "createDM" in userB ? userB : null,
      channelA,
      channelB,
      options.header ?? true,
    );
    tunnel.listen();
    tunnel.arm(options.timeoutMs ?? DefaultTunnelTimeoutMs);
    return tunnel;
  }

  public get closed(): boolean {
    return this.done;
  }

  public async close(reason = "Tunnel closed."): Promise<void> {
    if (this.done) return;
    this.done = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.handler) {
      this.services.client.off(Events.MessageCreate, this.handler);
      this.handler = null;
    }
    await Promise.allSettled([
      this.channelA.send(reason).catch(() => undefined),
      this.channelB.send(reason).catch(() => undefined),
    ]);
  }

  private arm(timeoutMs: number): void {
    this.timer = setTimeout(() => {
      void this.close("Tunnel timed out.");
    }, timeoutMs);
    this.timer.unref?.();
  }

  private listen(): void {
    this.handler = (message: Message) => {
      void this.relay(message).catch((err: unknown) =>
        this.services.logger.warn("[Tunnel] Relay failed:", err),
      );
    };
    this.services.client.on(Events.MessageCreate, this.handler);
  }

  private async relay(message: Message): Promise<void> {
    if (this.done || message.author.bot || message.webhookId) return;
    const inA = message.channelId === this.channelA.id;
    const inB = message.channelId === this.channelB.id;
    if (!inA && !inB) return;
    const fromA =
      (inA && message.author.id === this.userA.id) ||
      (inB && this.userB !== null && message.author.id !== this.userB.id);
    if (!fromA && !this.isCounterpart(message)) return;
    const target = inA ? this.channelB : this.channelA;
    const files = [...message.attachments.values()].map((a) => a.url);
    const content = this.header
      ? `**${message.author.tag}:** ${message.content || ""}`
      : message.content;
    await target.send({
      ...(content.length > 0 ? { content } : {}),
      ...(files.length > 0 ? { files } : {}),
      allowedMentions: {},
    });
  }

  private isCounterpart(message: Message): boolean {
    if (message.channelId === this.channelA.id) {
      return message.author.id === this.userA.id;
    }
    if (this.userB) return message.author.id === this.userB.id;
    return !message.author.bot;
  }
}
