interface SentryInit {
  init: (options: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
  }) => void;
  flush?: (timeoutMs?: number) => Promise<boolean>;
}

let started = false;
let flushImpl: ((timeoutMs?: number) => Promise<boolean>) | undefined;

export function startSentry(): void {
  if (started) return;
  const dsn = process.env["SENTRY_DSN"] ?? process.env["SENTRY_URL"];
  if (!dsn) return;
  started = true;

  void (async () => {
    try {
      let mod: unknown = null;
      for (const name of ["@sentry/bun", "@sentry/node"]) {
        const specifier: string = name;
        mod = await import(specifier).catch(() => null);
        if (mod) break;
      }
      const sentry = mod as SentryInit | null;
      if (!sentry || typeof sentry.init !== "function") {
        started = false;
        return;
      }
      sentry.init({
        dsn,
        environment:
          process.env["SENTRY_ENVIRONMENT"] ?? process.env["NODE_ENV"],
        tracesSampleRate: process.env["SENTRY_TRACES_SAMPLE_RATE"]
          ? Number(process.env["SENTRY_TRACES_SAMPLE_RATE"])
          : 0,
      });
      if (typeof sentry.flush === "function") {
        const flush = sentry.flush.bind(sentry);
        flushImpl = flush;
      }
    } catch {
      started = false;
    }
  })();
}

export async function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  if (!flushImpl) return false;
  try {
    return await flushImpl(timeoutMs);
  } catch {
    return false;
  }
}
