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
  title:       "Tenant Hub",
  description: "Enterprise HMO Tenant Management",
};

export const viewport: Viewport = {
  themeColor: "#E8A84C",
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
