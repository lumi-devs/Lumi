export interface UserErrorOptions {
  identifier: string;
  message?: string;
  context?: unknown;
}

export class UserError extends Error {
  public readonly identifier: string;
  public readonly context: unknown;

  public constructor(options: UserErrorOptions | string) {
    const opts = typeof options === "string" ? { identifier: "UserError", message: options } : options;
    super(opts.message ?? opts.identifier);
    this.name = "UserError";
    this.identifier = opts.identifier;
    this.context = opts.context;
  }
}
