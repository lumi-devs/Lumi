import { Piece } from "@sapphire/framework";

export class Service extends Piece {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, options);
  }
}
