export function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
