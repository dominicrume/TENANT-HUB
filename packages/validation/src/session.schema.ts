/**
 * Session schemas — canonical shapes for support sessions.
 * Mirrors the `sessions` table. z.infer is the only Session type.
 */
import { z } from "zod";
import { UkDateSchema } from "./primitives";

export const SessionTypeSchema = z.enum(["daily", "weekly", "monthly"]);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  session_type: SessionTypeSchema,
  session_date: UkDateSchema,
  notes: z.string().min(1, "Notes are required"),
  entered_by: z.string().uuid().optional(),
  entered_by_name: z.string().optional(),
  blockchain_hash: z.string().optional(),
  created_at: z.string().datetime().optional(),
});

export const SessionCreateSchema = SessionSchema.omit({
  id: true,
  entered_by: true,
  blockchain_hash: true,
  created_at: true,
});

export type Session = z.infer<typeof SessionSchema>;
export type SessionCreate = z.infer<typeof SessionCreateSchema>;
