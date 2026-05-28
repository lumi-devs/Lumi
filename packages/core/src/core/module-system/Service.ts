import { Piece } from "@sapphire/framework";

export class Service extends Piece {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, options);
  }

  public get logger() {
    return this.container.logger;
  }

  public get db() {
    return this.container.db;
  }

  public get redis() {
    return this.container.redis;
  }
}
