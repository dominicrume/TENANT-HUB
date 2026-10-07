import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react";

// Loaded via next/font (self-hosted at build time, preloaded, no render-
// blocking request) rather than the old globals.css `@import url(fonts
// .googleapis.com/...)` — that was a real network round-trip blocking first
// paint, worst on exactly the slow mobile connections this is meant to feel
// fast on. Exposed as CSS variables; packages/ui/src/tokens.ts's fonts.sans/
// mono reference them, so every `font-sans`/`font-mono` Tailwind utility in
// the app picks up the real loaded face, not just a Google Fonts guess.
const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sora",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title:       "Matty's Place",
  description: "Housing benefit chased, rent reconciled, certificates watched, repairs triaged. Checked every day, so you only see the decisions that need a person.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Matty's Place: Tenant Hub",
    description: "Supported housing, run by an operations console.",
    siteName: "Matty's Place",
    type: "website",
  },
};

// Nothing in this app is a public, cacheable page — every screen is behind
// auth and reads live, per-request data. Forcing dynamic rendering here,
// once, for the whole app stops Next.js from trying to statically prerender
// any page at build time — which matters because build-time prerendering
// executes page code before any runtime secret exists to authenticate with,
// and at least six pages construct a Supabase client as part of just
// rendering. Found the hard way: a Railway build with no Supabase
// credentials configured (by design — DECISIONS D27) failed prerendering
// /maintenance with "Your project's URL and Key are required to create a
// Supabase client". This is the general fix, not a patch for that one page.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#E8A84C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased bg-cream text-navy">
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
