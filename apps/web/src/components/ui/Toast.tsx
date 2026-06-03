/**
 * Toast — fixed bottom-right notifications. Navy card with amber/green/red
 * accent, spring-in, auto-dismiss after 2800ms. Exposes useToast().
 */
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Variant = "success" | "error" | "info";
interface ToastItem { id: number; message: string; variant: Variant }

const ACCENT: Record<Variant, string> = { success: "#34C87A", error: "#E05252", info: "#E8A84C" };

const ToastContext = createContext<((message: string, variant?: Variant) => void) | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, variant: Variant = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: "var(--navy)", color: "#fff", borderLeft: `4px solid ${ACCENT[t.variant]}`,
            borderRadius: "8px", padding: "10px 16px", fontSize: "13px", fontFamily: "'Sora',sans-serif",
            boxShadow: "0 8px 24px rgba(15,28,46,0.25)", animation: "toastIn 0.25s ease-out",
          }}>
            {t.message}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn { from { transform: translateY(80px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
