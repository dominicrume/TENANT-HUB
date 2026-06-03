/**
 * ESLint boundary rules — enforces the one-directional dependency graph.
 * A violation here is a BUILD FAILURE, not a warning.
 */
module.exports = {
  plugins: ["import"],
  rules: {
    "import/no-restricted-paths": ["error", {
      zones: [
        // ui must never import infrastructure packages
        {
          target: "./packages/ui/src",
          from: [
            "./packages/domain/src",
            "./packages/ai/src",
            "./packages/db/src",
            "./packages/blockchain/src",
            "./packages/auth/src",
          ],
          message: "packages/ui is PRESENTATIONAL ONLY. No domain/ai/db/blockchain/auth imports.",
        },
        // ai must never import browser/infra packages
        {
          target: "./packages/ai/src",
          from: [
            "./packages/ui/src",
            "./packages/blockchain/src",
            "./node_modules/next",
            "./node_modules/@supabase",
          ],
          message: "packages/ai must not import ui/blockchain/next/@supabase. Use injected SecureDbGateway.",
        },
        // audit/validation/env must be pure — no infra
        {
          target: ["./packages/audit/src", "./packages/validation/src", "./packages/env/src"],
          from: [
            "./packages/db/src",
            "./packages/blockchain/src",
            "./packages/auth/src",
            "./node_modules/@supabase",
          ],
          message: "packages/audit, validation, and env must import no infrastructure.",
        },
        // service-role client locked to packages/db
        {
          target: [
            "./apps/web/src",
            "./apps/worker/src",
            "./packages/ai/src",
            "./packages/auth/src",
            "./packages/ui/src",
            "./packages/domain/src",
            "./packages/intake-core/src",
            "./packages/validation/src",
            "./packages/audit/src",
            "./packages/blockchain/src",
          ],
          from: "./packages/db/src/client.ts",
          message: "The Supabase service-role client is quarantined in packages/db/src/client.ts. Do not import it directly.",
        },
      ],
    }],
  },
};
