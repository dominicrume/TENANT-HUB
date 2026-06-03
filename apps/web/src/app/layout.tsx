import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Tenant Hub",
  description: "Enterprise HMO Tenant Management",
  themeColor:  "#E8A84C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
