import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { handlePrismaError } from "../../src/lib/prisma/errors.js";

describe("handlePrismaError — information disclosure hardening", () => {
  it("does not leak raw Prisma message for unknown error codes", () => {
    const raw =
      "Invalid prisma.user.findMany() invocation at /app/prisma/schema.prisma:42\n" +
      "Unique constraint failed on the fields: (`email`)";
    const err = new Prisma.PrismaClientKnownRequestError(raw, {
      code: "P9999",
      clientVersion: "5.0.0",
      meta: {},
    });

    const result = handlePrismaError(err);

    expect(result.message).not.toContain("schema.prisma");
    expect(result.message).not.toContain("prisma.user.findMany");
    expect(result.message).not.toContain("email");
    expect(result.message).toContain("P9999");
  });

  it("returns a safe hardcoded message for P2002 (unique violation)", () => {
    const raw = "Unique constraint failed on the constraint: `User_email_key` at /app/prisma/schema.prisma";
    const err = new Prisma.PrismaClientKnownRequestError(raw, {
      code: "P2002",
      clientVersion: "5.0.0",
      meta: {},
    });
    const result = handlePrismaError(err);
    expect(result.message).toBe("Unique constraint violation.");
    expect(result.message).not.toContain("schema.prisma");
    expect(result.message).not.toContain("User_email_key");
  });

  it("returns a safe hardcoded message for P2025 (not found)", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "An operation failed because it depends on one or more records that were required but not found. /app/prisma/schema.prisma",
      { code: "P2025", clientVersion: "5.0.0", meta: {} },
    );
    const result = handlePrismaError(err);
    expect(result.message).toBe("Record not found.");
    expect(result.message).not.toContain("schema.prisma");
  });

  it("does not leak raw message for PrismaClientValidationError", () => {
    const raw =
      'Argument `where` of type `UserWhereUniqueInput` needs at least one of `id` or `email` arguments at /app/node_modules/.prisma/client/index.js';
    const err = new Prisma.PrismaClientValidationError(raw, {
      clientVersion: "5.0.0",
    });
    const result = handlePrismaError(err);
    expect(result.message).toBe("Database validation error.");
    expect(result.message).not.toContain("UserWhereUniqueInput");
    expect(result.message).not.toContain("index.js");
  });

  it("does not leak raw message for PrismaClientInitializationError", () => {
    const raw =
      "Can't reach database server at `postgres:5432`. Please make sure your database server is running at `postgres:5432`.";
    const err = new Prisma.PrismaClientInitializationError(raw, "5.0.0");
    const result = handlePrismaError(err);
    expect(result.message).toBe("Failed to initialize database connection.");
    expect(result.message).not.toContain("postgres:5432");
  });
});
