import { container } from "@sapphire/framework";

export function errorFrom(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object" && "message" in err)
    return new Error(String((err as { message: unknown }).message));
  return new Error(String(err));
}

export function logError(context: string, err: unknown): void {
  container.logger.error(`[${context}]`, errorFrom(err));
}
