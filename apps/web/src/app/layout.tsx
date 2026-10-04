import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title:       "Matty's Place",
  description: "Enterprise HMO Tenant Management",
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
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
