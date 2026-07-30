import { MessageFlags } from "discord.js";
import { randomBytes } from "node:crypto";
import type { CardReply, View, ViewContext, MenuEntry } from "./types.js";

const SESSION_TTL = 5 * 60_000;

export type PanelType = "hub" | "config" | "help" | "ping" | "general";

export class NavigationSession {
  static readonly sessions = new Map<string, NavigationSession>();
  private static cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly id: string;
  readonly userId: string;
  readonly type: PanelType;
  readonly createdAt: number;
  private stack: View[] = [];
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(userId: string, type: PanelType = "general") {
    this.id = randomBytes(6).toString("base64url");
    this.userId = userId;
    this.type = type;
    this.createdAt = Date.now();
    this.startTimeout();
  }

  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutTimer = setTimeout(() => this.destroy(), SESSION_TTL);
    this.timeoutTimer?.unref();
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  get current(): View | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1]! : null;
  }

  get depth(): number {
    return this.stack.length;
  }

  push(view: View): void {
    this.stack.push(view);
    this.startTimeout();
    NavigationSession.cleanupTimers.delete(this.userId);
  }

  pop(): View | null {
    if (this.stack.length <= 1) return null;
    const view = this.stack.pop();
    this.startTimeout();
    return view ?? null;
  }

  replace(view: View): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1] = view;
    } else {
      this.stack.push(view);
    }
    this.startTimeout();
  }

  reset(view: View): void {
    this.stack = [view];
    this.startTimeout();
  }

  resetToRoot(): void {
    if (this.stack.length > 1) {
      this.stack = [this.stack[0]!];
    }
    this.startTimeout();
  }

  async render(ctx: ViewContext): Promise<CardReply> {
    const view = this.current;
    if (!view) {
      return {
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [],
        allowedMentions: { parse: [] },
      };
    }
    this.startTimeout();
    return view.render(ctx);
  }

  destroy(): void {
    this.clearTimeout();
    NavigationSession.sessions.delete(this.id);
    NavigationSession.cleanupTimers.set(
      this.userId,
      setTimeout(() => NavigationSession.cleanupTimers.delete(this.userId), 60_000),
    );
  }

  static create(userId: string, type: PanelType = "general"): NavigationSession {
    NavigationSession.cleanup(userId);
    const session = new NavigationSession(userId, type);
    NavigationSession.sessions.set(session.id, session);
    return session;
  }

  static get(sessionId: string): NavigationSession | undefined {
    const session = NavigationSession.sessions.get(sessionId);
    if (session) session.startTimeout();
    return session;
  }

  static cleanup(userId: string): void {
    for (const [id, session] of NavigationSession.sessions) {
      if (session.userId === userId) {
        session.destroy();
        NavigationSession.sessions.delete(id);
      }
    }
  }
}

export function parseNavCustomId(customId: string): {
  prefix: string;
  sessionId: string;
  action: string;
  payload?: string;
} | null {
  const parts = customId.split(":");
  if (parts.length < 3 || parts[0] !== "ui") return null;
  return {
    prefix: parts[0],
    sessionId: parts[1]!,
    action: parts[2]!,
    payload: parts.length > 3 ? parts.slice(3).join(":") : undefined,
  };
}

export function encodeNavCustomId(
  sessionId: string,
  action: string,
  payload?: string,
): string {
  return payload ? `ui:${sessionId}:${action}:${payload}` : `ui:${sessionId}:${action}`;
}

// Re-export types for convenience
export type { View, ViewContext, MenuEntry };