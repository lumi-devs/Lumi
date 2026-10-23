export class UserError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
