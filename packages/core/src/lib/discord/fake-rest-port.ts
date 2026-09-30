import type { APIGuild, APIGuildMember } from "discord-api-types/v10";
import type { DiscordRestPort } from "./rest-port.js";

type PortMethod = keyof DiscordRestPort;

/**
 * In-memory `DiscordRestPort` for tests. Seed guilds/members with `seed*`
 * (or leave a target unseeded, so a lookup resolves `null` / an undo no-ops,
 * mirroring the real adapter's confirmed-absent handling); use `failNextWith`
 * to make one specific method's next call reject instead, for the "Discord
 * denies the request" paths (a 5xx guild lookup, a 50013 undo, ...) tests
 * need to exercise against the port's contract.
 */
export class FakeDiscordRestPort implements DiscordRestPort {
  readonly #guilds = new Map<string, APIGuild>();
  readonly #members = new Map<string, APIGuildMember>();
  readonly #failNext = new Map<PortMethod, Error>();

  public seedGuild(guild: APIGuild): void {
    this.#guilds.set(guild.id, guild);
  }

  public seedMember(
    guildId: string,
    member: APIGuildMember & { user: { id: string } },
  ): void {
    this.#members.set(`${guildId}:${member.user.id}`, member);
  }

  public removeMember(guildId: string, userId: string): void {
    this.#members.delete(`${guildId}:${userId}`);
  }

  /** The next call to `method` rejects with `err` instead of running normally. */
  public failNextWith(method: PortMethod, err: Error): void {
    this.#failNext.set(method, err);
  }

  public fetchGuild(guildId: string): Promise<APIGuild | null> {
    return this.#run("fetchGuild", () =>
      Promise.resolve(this.#guilds.get(guildId) ?? null),
    );
  }

  public fetchMember(guildId: string, userId: string): Promise<APIGuildMember | null> {
    return this.#run("fetchMember", () =>
      Promise.resolve(this.#members.get(`${guildId}:${userId}`) ?? null),
    );
  }

  public removeBan(_guildId: string, _userId: string, _reason: string): Promise<void> {
    return this.#run("removeBan", () => Promise.resolve());
  }

  public clearTimeout(_guildId: string, _userId: string, _reason: string): Promise<void> {
    return this.#run("clearTimeout", () => Promise.resolve());
  }

  public clearVoiceMute(_guildId: string, _userId: string, _reason: string): Promise<void> {
    return this.#run("clearVoiceMute", () => Promise.resolve());
  }

  #run<T>(method: PortMethod, fn: () => Promise<T>): Promise<T> {
    const err = this.#failNext.get(method);
    if (err) {
      this.#failNext.delete(method);
      return Promise.reject(err);
    }
    return fn();
  }
}
