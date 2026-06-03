import type { Config } from "tailwindcss";
import { tokens } from "@tenant-hub/ui";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:    tokens.colors.navy,
        amber:   tokens.colors.amber,
        cream:   tokens.colors.cream,
        surface: tokens.colors.surface,
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
