/**
 * Client provider tree — wraps the app in Auth + Brand context.
 * Kept separate so the root layout can stay a server component.
 */
"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../contexts/AuthContext";
import { BrandProvider } from "../contexts/BrandContext";
import { ToastProvider } from "../components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <BrandProvider>
        <ToastProvider>{children}</ToastProvider>
      </BrandProvider>
    </AuthProvider>
  );
}
