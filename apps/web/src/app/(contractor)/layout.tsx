"use client";

import { MainLayout } from "../../components/layout/MainLayout";

const CONTRACTOR_NAV = [
  { href: "/jobs", label: "My Jobs", icon: "🛠️" },
  { href: "/contractor/settings", label: "Settings", icon: "⚙️" },
];

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  return (
    <MainLayout navItems={CONTRACTOR_NAV}>
      {children}
    </MainLayout>
  );
}
