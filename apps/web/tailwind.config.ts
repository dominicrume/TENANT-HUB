import type { Config } from "tailwindcss";
// Import tokens directly (not the package index, which re-exports a React
// component jiti can't resolve while loading this config).
import { tokens } from "../../packages/ui/src/tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:       tokens.colors.navy,
        ink:        tokens.colors.ink,
        amber:      tokens.colors.amber,
        "amber-deep": tokens.colors.amberDeep,
        cream:      tokens.colors.cream,
        surface:    tokens.colors.surface,
        line:       tokens.colors.line,
        "line-soft": tokens.colors.lineSoft,
        slate:      tokens.colors.slate,
        "slate-2":  tokens.colors.slate2,
        live:       tokens.colors.live,
        brick:      tokens.colors.brick,
        violet:     tokens.colors.violet,
        success: tokens.colors.success,
        danger:  tokens.colors.danger,
        muted:   tokens.colors.muted,
        border:  tokens.colors.border,
        chain:   tokens.colors.chain,
      },
      fontFamily: {
        sans: tokens.fonts.sans,
        mono: tokens.fonts.mono,
      },
      minHeight: { touch: tokens.spacing.touchMin },
      minWidth:  { touch: tokens.spacing.touchMin },
    },
  },
  plugins: [],
};
export default config;
