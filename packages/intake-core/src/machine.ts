/**
 * 5-Step Intake Pipeline — XState v5 machine.
 * Framework-free: no React, no Next.js, no Supabase.
 * URL == machine state (enforced by server-side guard in apps/web).
 *
 * States:
 *  input_selection → extraction → staff_review → tenant_verify → complete
 *
 * Draft snapshots are persisted to the `drafts` table after each transition.
 * NEVER stored in localStorage or sessionStorage.
 */
import { createMachine, assign } from "xstate";
import type { TenantCreate } from "@tenant-hub/validation";

export type InputMode = "manual" | "ocr" | "voice";

export interface IntakeContext {
  draft_id:       string | null;
  input_mode:     InputMode | null;
  ocr_raw:        string | null;     // raw OCR text before correction
  extracted:      Partial<TenantCreate> | null;
  confirmed_by:   string | null;     // staff user_id
  confirmed_at:   string | null;     // ISO timestamp
  canonical_hash: string | null;     // hash shown to tenant for signing
  signature_hash: string | null;     // hash of signed record (must equal canonical_hash)
  error:          string | null;
}

export type IntakeEvent =
  | { type: "SELECT_MODE";      mode: InputMode }
  | { type: "OCR_COMPLETE";     raw: string; extracted: Partial<TenantCreate> }
  | { type: "MANUAL_ENTRY";     data: Partial<TenantCreate> }
  | { type: "STAFF_CONFIRM";    user_id: string; timestamp: string; hash: string }
  | { type: "TENANT_SIGN";      signature_hash: string }
  | { type: "COMMIT_SUCCESS" }
  | { type: "ERROR";            message: string }
  | { type: "BACK" };

export const intakeMachine = createMachine(
  {
    id: "intake",
    initial: "input_selection",
    types: {} as { context: IntakeContext; events: IntakeEvent },
    context: {
      draft_id: null, input_mode: null, ocr_raw: null,
      extracted: null, confirmed_by: null, confirmed_at: null,
      canonical_hash: null, signature_hash: null, error: null,
    },
    states: {
      input_selection: {
        on: {
          SELECT_MODE: {
            target: "extraction",
            actions: assign({ input_mode: ({ event }) => event.mode }),
          },
        },
      },
      extraction: {
        on: {
          OCR_COMPLETE: {
            target: "staff_review",
            actions: assign({
              ocr_raw:   ({ event }) => event.raw,
              extracted: ({ event }) => event.extracted,
            }),
          },
          MANUAL_ENTRY: {
            target: "staff_review",
            actions: assign({ extracted: ({ event }) => event.data }),
          },
          BACK: "input_selection",
        },
      },
      staff_review: {
        on: {
          STAFF_CONFIRM: {
            target: "tenant_verify",
            actions: assign({
              confirmed_by:   ({ event }) => event.user_id,
              confirmed_at:   ({ event }) => event.timestamp,
              canonical_hash: ({ event }) => event.hash,
            }),
          },
          BACK: "extraction",
          ERROR: { actions: assign({ error: ({ event }) => event.message }) },
        },
      },
      tenant_verify: {
        on: {
          TENANT_SIGN: [
            {
              // H4: signature hash MUST match canonical hash
              guard: ({ context, event }) =>
                event.signature_hash === context.canonical_hash,
              target: "complete",
              actions: assign({ signature_hash: ({ event }) => event.signature_hash }),
            },
            {
              target: "tenant_verify",
              actions: assign({ error: () => "Signature mismatch — record may have changed. Please restart." }),
            },
          ],
          BACK: "staff_review",
        },
      },
      complete: {
        type: "final",
      },
    },
  }
);
