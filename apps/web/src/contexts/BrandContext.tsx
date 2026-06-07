/**
 * BrandContext — which letterhead is active (Matty's Place / Ash Shahada /
 * Reliance). One click swaps the letterhead; content is identical.
 * Persisted to localStorage 'th_brand'. Default: mattys_place.
 *
 * NOTE: localStorage here is for a UI PREFERENCE only — not intake pipeline
 * state (H5 bans browser storage for pipeline drafts, which live in the DB).
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { BrandSchema } from "@tenant-hub/validation";

export type Brand = z.infer<typeof BrandSchema>;

export const BRAND_LABELS: Record<Brand, string> = {
  mattys_place: "Matty's Place",
  ash_shahada: "Ash Shahada Housing Association Ltd",
  reliance: "Reliance Housing",
};

const STORAGE_KEY = "th_brand";

interface BrandValue {
  brand: Brand;
  setBrand: (b: Brand) => void;
  label: string;
}

const BrandContext = createContext<BrandValue | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<Brand>("mattys_place");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = BrandSchema.safeParse(stored);
    if (parsed.success) setBrandState(parsed.data);
  }, []);

  function setBrand(b: Brand) {
    setBrandState(b);
    localStorage.setItem(STORAGE_KEY, b);
  }

  return (
    <BrandContext.Provider value={{ brand, setBrand, label: BRAND_LABELS[brand] || "Tenant Hub" }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within <BrandProvider>");
  return ctx;
}
