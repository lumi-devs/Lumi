import { error, type RequestEvent } from "@sveltejs/kit";
import { z, type ZodType } from "zod";

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export function assertCsrf(event: RequestEvent, data: FormData): string {
  const session = event.locals.session;
  if (!session) throw error(401, "Sign in again to continue.");
  const submitted = data.get("_csrf");
  if (
    typeof submitted !== "string" ||
    !safeEqual(submitted, session.csrfToken)
  ) {
    throw error(
      403,
      "Invalid or expired form token. Reload the page and retry.",
    );
  }
  return session.userId;
}

export function formString(
  data: FormData,
  name: string,
  fallback = "",
): string {
  const value = data.get(name);
  return typeof value === "string" ? value : fallback;
}

export function optionalFormString(
  data: FormData,
  name: string,
): string | null {
  const value = formString(data, name).trim();
  return value === "" ? null : value;
}

export function checkbox(data: FormData, name: string): boolean {
  const value = data.get(name);
  return value === "on" || value === "true" || value === "1";
}

export function parseInput<T>(
  schema: ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  const path = first?.path.length ? `${first.path.join(".")}: ` : "";
  return { ok: false, message: `${path}${first?.message ?? "Invalid input."}` };
}

export const IdSchema = z
  .string()
  .trim()
  .regex(/^\d{16,22}$/, "Expected a Discord snowflake ID.");

export const OptionalIdSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{16,22}$/.test(value), {
    message: "Expected a Discord snowflake ID or an empty value.",
  })
  .transform((value) => (value === "" ? null : value));

export const DateInputSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), {
    message: "Expected a valid date/time.",
  })
  .transform((value) => (value === "" ? null : new Date(value)));

export function splitList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

export { z };
