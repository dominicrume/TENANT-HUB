/**
 * UK-specific validated primitives.
 * These are the canonical definitions — typed ONCE here, used everywhere.
 */
import { z } from "zod";

export const NinoSchema = z
  .string()
  .regex(/^[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]$/i, "Invalid National Insurance number")
  .transform(v => v.replace(/\s/g, "").toUpperCase());

// International phone — accepts numbers from all countries (per the forms brief:
// "allow the number population to accept all countries"). Optional leading +,
// digits with spaces/hyphens/parentheses, 7–20 chars. UkPhoneSchema kept as an
// alias so existing imports keep working.
export const PhoneSchema = z
  .string()
  .regex(/^\+?[\d\s().-]{7,20}$/, "Invalid phone number");
export const UkPhoneSchema = PhoneSchema;

export const UkDateSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const parsed = new Date(v.replace(/(st|nd|rd|th)/gi, ""));
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return v;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"));

export const UkPostcodeSchema = z
  .string()
  .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, "Invalid UK postcode")
  .transform(v => v.toUpperCase());

export const MoneyGbpSchema = z.preprocess(
  (v) => (typeof v === "string" ? parseFloat(v.replace(/[^0-9.-]+/g, "")) : v),
  z.number().nonnegative("Amount cannot be negative")
);

export type Nino = z.infer<typeof NinoSchema>;
export type UkPhone = z.infer<typeof UkPhoneSchema>;
export type UkDate = z.infer<typeof UkDateSchema>;
export type MoneyGbp = z.infer<typeof MoneyGbpSchema>;
