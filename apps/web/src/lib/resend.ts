import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set. Skipping email to:", to);
    return;
  }

  await resend.emails.send({
    from: "Tenant Hub <noreply@mattysplace.org.uk>",
    to,
    subject: "Welcome to Tenant Hub",
    html: `<p>Hi ${name},</p><p>Welcome to Tenant Hub. Your account has been provisioned.</p>`,
  });
}
