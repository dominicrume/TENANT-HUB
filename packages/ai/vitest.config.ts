import { defineConfig } from "vitest/config";

/**
 * The Vercel AI SDK's transitive zod-to-json-schema dependency imports a zod
 * subpath ("zod/v3") that this monorepo's pinned zod@3.23.8 does not expose
 * under Node's strict ESM "exports" resolution. Next.js's webpack bundler
 * tolerates this; Vitest's native Node resolution does not. Inlining the
 * offending packages routes them through Vite's own resolver instead, which
 * is lenient the same way webpack is. This package had no tests before
 * BUILD_PLAN.md C24 — nothing here was previously exercised.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    server: { deps: { inline: [/zod-to-json-schema/, /^ai$/, /@ai-sdk\//] } },
  },
});
