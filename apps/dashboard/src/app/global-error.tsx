"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b0f",
          color: "#ecedf2",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "28rem", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0 }}>
            The dashboard failed to render
          </h1>
          <p
            style={{
              fontSize: "0.8125rem",
              lineHeight: 1.6,
              color: "#969caa",
              marginTop: "0.5rem",
            }}
          >
            This is the last-resort boundary — the root layout itself threw.
            Check the dashboard process logs.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                color: "#969caa",
                marginTop: "0.75rem",
              }}
            >
              {error.digest}
            </p>
          ) : null}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.25rem",
              fontSize: "0.8125rem",
              color: "#5b8cff",
            }}
          >
            Back to the dashboard
          </a>
        </main>
      </body>
    </html>
  );
}
