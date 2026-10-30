import { AccentColors, makeCard, makeInfoCard, type CardReply } from "@lumi/ui";
import { z } from "zod";
import { AccentKeys, Limits, type AccentKey, type ResponseSpec } from "./types.js";

export const CardResponseSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    body: z.union([
      z.string().max(8_000),
      z.array(z.string().max(4_000)).min(1).max(20),
    ]),
    accent: z.enum(AccentKeys).optional(),
  })
  .strict();

export const ResponseSchema = z.union([
  z.string().min(1).max(8_000),
  CardResponseSchema,
]);

export const ResponsesSchema = z
  .array(ResponseSchema)
  .min(1)
  .max(Limits.responsesPerCommand);

export function parseResponses(value: unknown): ResponseSpec[] {
  return ResponsesSchema.parse(value);
}

export function parseResponseInput(input: string): ResponseSpec[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Provide at least one response.");
  }
  if (!trimmed.startsWith("[") && !/^\{\s*"/.test(trimmed)) {
    return [trimmed];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Response JSON is invalid.");
  }
  return parseResponses(Array.isArray(parsed) ? parsed : [parsed]);
}

export function isCardResponse(
  response: ResponseSpec,
): response is Exclude<ResponseSpec, string> {
  return typeof response !== "string";
}

export function accentColor(accent: AccentKey | undefined): number | undefined {
  return accent ? AccentColors[accent] : undefined;
}

export function buildResponseCard(
  fallbackTitle: string,
  response: ResponseSpec,
  renderedTitle: string,
  renderedBody: string | string[],
): CardReply {
  if (typeof response === "string") {
    return makeInfoCard(fallbackTitle, renderedBody);
  }
  return makeCard(
    accentColor(response.accent),
    renderedTitle || fallbackTitle,
    renderedBody,
    { noAccent: response.accent === undefined },
  );
}

export function renderedResponseSize(
  title: string,
  body: string | string[],
): number {
  const encoder = new TextEncoder();
  const bodyText = Array.isArray(body) ? body.join("\n") : body;
  return encoder.encode(`${title}\n${bodyText}`).byteLength;
}
