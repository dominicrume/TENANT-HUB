/**
 * Design tokens — single source of truth.
 * Used by Tailwind config AND React components AND globals.css (kept in sync by hand;
 * the CSS custom properties in apps/web/src/app/globals.css mirror these names).
 * NEVER use generic Tailwind blue-/red- colours in branded components.
 *
 * Semantics (see docs/ESTATE_OPS_INTEGRATION_PROMPT.md §4.3):
 *  - amber is spent ONLY where a decision or action lives
 *  - live green marks LIVE data and healthy agents
 *  - brick marks money owed and emergencies (grounded in bricks, not a generic alert red)
 *  - violet marks receipts and the audit chain
 */
export const tokens = {
  colors: {
    navy:      "#0F1C2E",
    ink:       "#16202E",
    amber:     "#E8A84C",
    amberDeep: "#C6871F",
    cream:     "#F8F4EF",
    surface:   "#FFFFFF",
    line:      "#E9E1D4",
    lineSoft:  "#F0EAE0",
    slate:     "#5C6673",
    slate2:    "#8A93A0",
    live:      "#2E9E6B",
    brick:     "#B24A31",
    violet:    "#6B5BD1",
    // Legacy semantic aliases (kept so existing components keep compiling)
    success: "#34C87A",
    danger:  "#E05252",
    warning: "#F59E0B",
    muted:   "#7A8499",
    border:  "#EDE8E1",
    // AI/Blockchain
    chain:   "#7C3AED",
  },
  fonts: {
    sans: ["Sora", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "Consolas", "monospace"],
  },
  spacing: {
    touchMin:  "56px",   // tablet intake: minimum touch target
    touchPhone:"44px",   // phone console: minimum touch target
  },
  radius: { card: "14px" },
} as const;

export type ColorToken = keyof typeof tokens.colors;
