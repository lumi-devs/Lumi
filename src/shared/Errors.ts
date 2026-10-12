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

export function errorFrom(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object" && "message" in err)
    return new Error(String(err.message));
  return new Error(String(err));
}

export function swallow(
  reason: string,
  onError: (reason: string, err: Error) => void = () => {},
): (err: unknown) => null {
  return (err: unknown) => {
    onError(reason, errorFrom(err));
    return null;
  };
}
