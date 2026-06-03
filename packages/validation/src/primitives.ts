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

export const UkDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const UkPostcodeSchema = z
  .string()
  .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, "Invalid UK postcode")
  .transform(v => v.toUpperCase());

export const MoneyGbpSchema = z
  .number()
  .nonnegative("Amount cannot be negative")
  .multipleOf(0.01, "Max 2 decimal places");

export type Nino = z.infer<typeof NinoSchema>;
export type UkPhone = z.infer<typeof UkPhoneSchema>;
export type UkDate = z.infer<typeof UkDateSchema>;
export type MoneyGbp = z.infer<typeof MoneyGbpSchema>;
