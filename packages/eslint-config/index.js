/**
 * ESLint boundary rules — enforces the one-directional dependency graph.
 * A violation here is a BUILD FAILURE, not a warning.
 */
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["import"],
  settings: {
    "import/resolver": {
      typescript: { project: ["packages/*/tsconfig.json", "apps/*/tsconfig.json"] },
      node: { extensions: [".js", ".ts", ".tsx"] },
    },
  },
  rules: {
    // The one database driver lives in packages/db (docs/PLATFORM_CONSOLIDATION.md step 1).
    "no-restricted-imports": ["error", {
      paths: [{ name: "pg", message: "pg is the database driver of packages/db only. Use a repository from @tenant-hub/db." }],
      patterns: [{ group: ["@estate-ops/*"], message: "Estate Ops is reference source only. Port the code; never import it." }],
    }],
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
        // kya / ports / telemetry are pure: no infrastructure, no framework
        {
          target: ["./packages/kya/src", "./packages/ports/src", "./packages/telemetry/src"],
          from: [
            "./packages/db/src", "./packages/blockchain/src", "./packages/auth/src", "./packages/adapters/src",
            "./packages/ai/src", "./packages/ui/src", "./node_modules/@supabase", "./node_modules/next", "./node_modules/pg",
          ],
          message: "packages/kya, ports and telemetry are pure. No infrastructure imports.",
        },
        // adapters talk to the outside world through ports only
        {
          target: "./packages/adapters/src",
          from: ["./packages/db/src", "./packages/ui/src", "./packages/ai/src", "./packages/blockchain/src", "./packages/auth/src", "./packages/domain/src", "./packages/intake-core/src", "./node_modules/@supabase", "./node_modules/next"],
          message: "packages/adapters may import ports, env and validation only.",
        },
        // ai never touches adapters directly (it receives ports)
        {
          target: "./packages/ai/src",
          from: ["./packages/adapters/src"],
          message: "packages/ai receives ports by injection; it never imports adapters.",
        },
        // the worker is headless: no UI, no Next
        {
          target: "./apps/worker/src",
          from: ["./packages/ui/src", "./node_modules/next"],
          message: "apps/worker is a headless runtime. No ui, no next.",
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
  overrides: [
    { files: ["packages/db/**/*.ts"], rules: { "no-restricted-imports": "off" } },
  ],
};
