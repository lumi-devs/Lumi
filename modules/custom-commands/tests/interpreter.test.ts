import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  TemplateError,
  validateTemplate,
} from "../interpreter/index.js";
import type { KvAdapter } from "../types.js";

const baseValues = {
  user: { id: "42", username: "ada", displayName: "Ada", bot: false },
  guild: { name: "Test Guild" },
  role: { id: "7", name: "Member" },
  args: Object.assign(["one", "two"], { raw: "one two" }),
  nested: { value: "deep" },
};

function fakeKv(): KvAdapter & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
      return value;
    },
    async incr(key, by = 1) {
      const next = Number(values.get(key) ?? 0) + by;
      values.set(key, next);
      return next;
    },
    async del(key) {
      return values.delete(key);
    },
  };
}

describe("custom command interpreter", () => {
  it("renders typed placeholders and paths", async () => {
    expect(
      await renderTemplate(
        "{{user.username}} / {{user.displayName}} / {{guild.name}} / {{role.name}}",
        { values: baseValues },
      ),
    ).toBe("ada / Ada / Test Guild / Member");
  });

  it("renders arguments and applies filters", async () => {
    expect(
      await renderTemplate(
        '{{args.0 | upper}} {{args.raw | trim}} {{args.length}} {{args | join:"-"}}',
        { values: baseValues },
      ),
    ).toBe("ONE one two 2 one-two");
    expect(
      await renderTemplate(
        '{{missing | default:"fallback"}} {{user.username | truncate:2}}',
        { values: baseValues },
      ),
    ).toBe("fallback a…");
  });

  it("supports if, else and comparisons", async () => {
    const template =
      "{{#if user.bot}}bot{{else}}{{#if args.length > 1}}multi{{else}}single{{/if}}{{/if}}";
    expect(await renderTemplate(template, { values: baseValues })).toBe("multi");
    expect(
      await renderTemplate(template, {
        values: { ...baseValues, user: { ...baseValues.user, bot: true } },
      }),
    ).toBe("bot");
  });

  it("supports range blocks with loop metadata", async () => {
    const template =
      "{{#range 1 3}}{{index}}:{{value}}{{#if last}}!{{/if}} {{/range}}";
    expect(await renderTemplate(template, { values: baseValues })).toBe(
      "0:1 1:2 2:3! ",
    );
  });

  it("supports range steps", async () => {
    expect(
      await renderTemplate("{{#range 0 4 2}}{{value}}{{/range}}", {
        values: baseValues,
      }),
    ).toBe("024");
  });

  it("does not expose dangerous object properties", async () => {
    const output = await renderTemplate(
      "{{constructor}}{{nested.__proto__}}{{user.constructor.name}}",
      { values: baseValues },
    );
    expect(output).toBe("");
  });

  it("reports template syntax errors", () => {
    expect(validateTemplate("{{#if user}}missing close").ok).toBe(false);
    expect(validateTemplate("{{#range 1}}x{{/range}}").ok).toBe(false);
    expect(validateTemplate("{{ unknownFilter | nope }}").ok).toBe(false);
    expect(validateTemplate("{{ fs.read(\"x\") }}").ok).toBe(false);
    expect(validateTemplate("{{user.name | upper}}").ok).toBe(true);
  });

  it("enforces the output byte limit", async () => {
    await expect(
      renderTemplate("{{#range 1 100}}abcdefghij{{/range}}", {
        values: baseValues,
        limits: { maxOutputBytes: 32 },
      }),
    ).rejects.toMatchObject({ code: "output-limit" });
  });

  it("enforces the range iteration limit", async () => {
    await expect(
      renderTemplate("{{#range 1 10}}{{value}}{{/range}}", {
        values: baseValues,
        limits: { maxRangeIterations: 3 },
      }),
    ).rejects.toMatchObject({ code: "range-limit" });
  });

  it("supports KV function calls and per-run operation limits", async () => {
    const kv = fakeKv();
    expect(
      await renderTemplate(
        '{{kv.set("name", "Ada")}}{{kv.get("name")}} {{kv.incr("count")}} {{kv.incr("count", 2)}}',
        { values: baseValues, kv },
      ),
    ).toBe("Ada 1 3");
    expect(kv.values.get("name")).toBe("Ada");
    expect(kv.values.get("count")).toBe(3);

    await expect(
      renderTemplate('{{kv.get("a")}}{{kv.get("b")}}', {
        values: baseValues,
        kv,
        limits: { maxKvOps: 1 },
      }),
    ).rejects.toMatchObject({ code: "kv-limit" });
  });

  it("rejects unknown filters and KV without an adapter", async () => {
    await expect(
      renderTemplate("{{user.username | missing}}", { values: baseValues }),
    ).rejects.toBeInstanceOf(TemplateError);

    await expect(
      renderTemplate('{{kv.get("x")}}', { values: baseValues }),
    ).rejects.toMatchObject({ code: "kv-unavailable" });
  });
});
