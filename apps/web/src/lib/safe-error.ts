/**
 * Routes never send a raw Postgres/Supabase/driver error straight to the
 * client — only a clean, human message. The real error is still logged
 * server-side (callers should `console.error` it) so it stays debuggable.
 *
 * A message is treated as "raw" (and swapped for a safe fallback) only when
 * it clearly mentions low-level database/driver internals a real user was
 * never meant to see — a relation/column/constraint name, a SQL keyword, a
 * Postgres error code, a stack trace, a connection error, etc. Anything
 * else — including Zod validation messages and business-rule messages that
 * were already written for a human (e.g. "Room 4 is already occupied by
 * another active tenant.") — is passed through unchanged.
 */

export const DEFAULT_SAVE_ERROR =
  "Could not save — please try again, or tell support if it keeps happening.";

const ALREADY_EXISTS_ERROR = "That already exists — please check and try again.";

const DUPLICATE_PATTERN = /duplicate key value|violates[\s\S]*unique constraint/i;

const RAW_ERROR_PATTERNS: RegExp[] = [
  /writeWithAudit failed/i,
  /\brelation\b[\s\S]*\bdoes not exist\b/i,
  /\bcolumn\b[\s\S]*\bdoes not exist\b/i,
  /violates[\s\S]*constraint/i,
  /duplicate key value/i,
  /null value in column/i,
  /invalid input (syntax|value for enum)/i,
  /value too long for type/i,
  /syntax error at or near/i,
  /permission denied for (table|relation|schema|column)/i,
  /\b(SELECT \*|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/,
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i,
  /\bPGRST\d+\b/i,
  /\n\s*at\s+\S+\s*\(/, // stack trace frame
];

function extractMessage(err: unknown): string | undefined {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return undefined;
}

function extractCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Turn any thrown/returned error into a message that is safe to show a user.
 * `fallback` lets a call site provide a more specific generic message
 * (default: a generic "could not save" message).
 */
export function toSafeErrorMessage(err: unknown, fallback: string = DEFAULT_SAVE_ERROR): string {
  const message = extractMessage(err);
  if (!message) return fallback;

  // A bare Postgres SQLSTATE code on the error object is itself a sure sign
  // this is a raw driver error, regardless of how the message reads.
  const code = extractCode(err);
  if (code && /^[0-9A-Z]{5}$/.test(code)) {
    return DUPLICATE_PATTERN.test(message) ? ALREADY_EXISTS_ERROR : fallback;
  }

  if (DUPLICATE_PATTERN.test(message)) return ALREADY_EXISTS_ERROR;
  if (RAW_ERROR_PATTERNS.some((re) => re.test(message))) return fallback;
  return message;
}
