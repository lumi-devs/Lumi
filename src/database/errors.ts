import { Prisma } from "@prisma/client";

export class DatabaseError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export function handlePrismaError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return new DatabaseError(
          "Unique constraint violation.",
          error.code,
          error,
        );
      case "P2025":
        return new DatabaseError("Record not found.", error.code, error);
      case "P1008":
        return new DatabaseError("Operation timed out.", error.code, error);
      default:
        return new DatabaseError(
          `Database error occurred: ${error.message}`,
          error.code,
          error,
        );
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new DatabaseError(
      "Failed to initialize database connection.",
      "INIT_ERROR",
      error,
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new DatabaseError(
      "Database validation error.",
      "VALIDATION_ERROR",
      error,
    );
  }

  return new DatabaseError(
    "An unknown database error occurred.",
    "UNKNOWN",
    error,
  );
}
