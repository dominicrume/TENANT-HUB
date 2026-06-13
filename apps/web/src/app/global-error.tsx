/**
 * Global error boundary — last-resort fallback so a top-level crash still shows
 * a readable message rather than a blank document.
 */
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h2>Tenant Hub hit an unexpected error.</h2>
        <p style={{ color: "#E05252" }}>{error.message}</p>
        <button onClick={reset}>Reload</button>
      </body>
    </html>
  );
}
