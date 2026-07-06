import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key_for_build");

const FROM_EMAIL = "Matty's Place <noreply@mattysplace.org.uk>";

// Premium Email Layout Wrapper
function emailTemplate(title: string, bodyContent: string, actionButton?: { text: string; url: string }) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #F8F4EF;
            color: #1A202C;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          .wrapper {
            width: 100%;
            background-color: #F8F4EF;
            padding: 40px 20px;
            box-sizing: border-box;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(15, 28, 46, 0.05);
            border: 1px solid #EDE8E1;
          }
          .header {
            background-color: #0B1B3D;
            padding: 32px;
            text-align: center;
          }
          .header h1 {
            color: #EDE8E1;
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.02em;
          }
          .header span {
            color: #E8A84C;
          }
          .content {
            padding: 40px 32px;
            line-height: 1.6;
            font-size: 16px;
            color: #334155;
          }
          .content p {
            margin-top: 0;
            margin-bottom: 16px;
          }
          .cta-container {
            text-align: center;
            margin: 32px 0 16px;
          }
          .button {
            display: inline-block;
            background-color: #E8A84C;
            color: #0B1B3D !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 16px;
            box-shadow: 0 4px 6px rgba(232, 168, 76, 0.2);
            transition: all 0.2s ease;
          }
          .footer {
            background-color: #0B1B3D;
            padding: 24px 32px;
            text-align: center;
            font-size: 12px;
            color: #94A3B8;
            border-top: 1px solid rgba(255,255,255,0.05);
          }
          .footer p {
            margin: 0 0 8px;
          }
          .footer a {
            color: #E8A84C;
            text-decoration: none;
          }
          .divider {
            height: 1px;
            background-color: #EDE8E1;
            margin: 24px 0;
          }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 99px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 16px;
          }
          .badge-alert {
            background-color: #FEE2E2;
            color: #991B1B;
          }
          .table-container {
            margin: 24px 0;
            border: 1px solid #EDE8E1;
            border-radius: 8px;
            overflow: hidden;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background-color: #f8fafc;
            padding: 12px;
            font-weight: 600;
            text-align: left;
            font-size: 14px;
            border-bottom: 1px solid #EDE8E1;
          }
          td {
            padding: 12px;
            font-size: 14px;
            border-bottom: 1px solid #EDE8E1;
          }
          tr:last-child td {
            border-bottom: none;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>Matty's<span>Place</span></h1>
            </div>
            <div class="content">
              ${bodyContent}
              ${actionButton ? `
                <div class="cta-container">
                  <a href="${actionButton.url}" class="button" target="_blank">${actionButton.text}</a>
                </div>
              ` : ''}
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Matty's Place OS. All rights reserved.</p>
              <p>This is an automated operational notification. For support, please contact your administrator.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

// 1. Welcome Email (Staff / Manager)
export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set. Skipping email to:", to);
    return;
  }

  const html = emailTemplate(
    "Welcome to Matty's Place",
    `<p>Dear ${name},</p>
     <p>Welcome to <strong>Matty's Place</strong>, the premier operating system for supported housing.</p>
     <p>Your staff account has been successfully provisioned. You now have full access to manage tenant intake records, rent ledgers, support sessions, and compliance files.</p>
     <p>Please log in using your registered credentials to configure your brand workspace settings.</p>`,
    { text: "Enter Workspace", url: "https://app.mattysplace.org.uk/login" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Welcome to Matty's Place — Your Account is Ready",
    html,
  });
}

// 2. Subscription Confirmation (Manager)
export async function sendSubscriptionEmail(to: string, name: string, plan: string) {
  if (!process.env.RESEND_API_KEY) return;

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const html = emailTemplate(
    "Subscription Confirmed",
    `<p>Hi ${name},</p>
     <p>Thank you for subscribing to Matty's Place. Your workspace has been upgraded to the <strong>${planLabel} Plan</strong>.</p>
     <p>All active features for this tier are now fully unlocked for your organization. Your billing cycle starts today, and invoices will be sent to this email address automatically.</p>
     <p>If you have any questions about organization configuration, our support desk is standing by.</p>`,
    { text: "Go to Workspace Dashboard", url: "https://app.mattysplace.org.uk/dashboard" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Matty's Place — ${planLabel} Subscription Confirmed`,
    html,
  });
}

// 3. Tenant Invite Email
export async function sendTenantInviteEmail(to: string, tenantName: string, inviteLink: string) {
  if (!process.env.RESEND_API_KEY) return;

  const html = emailTemplate(
    "Your Tenant Portal Invite",
    `<p>Hello ${tenantName},</p>
     <p>Your support housing provider has invited you to access the <strong>Matty's Place Tenant Portal</strong>.</p>
     <p>Through this portal, you can securely inspect your rent ledger history, report maintenance issues directly to staff, and track your ongoing support plan goals.</p>
     <p>Please click the button below to sign in and set up your portal passcode.</p>`,
    { text: "Access Tenant Portal", url: inviteLink }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Access Your Tenant Portal — Matty's Place",
    html,
  });
}

// 4. Rent / Service Charge Due Reminder
export async function sendRentDueReminder(to: string, tenantName: string, amount: number, dueDate: string) {
  if (!process.env.RESEND_API_KEY) return;

  const formattedAmount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  const html = emailTemplate(
    "Service Charge Reminder",
    `<p>Hello ${tenantName},</p>
     <p>This is a friendly reminder that your weekly service charge is due soon.</p>
     <div class="table-container">
       <table>
         <thead>
           <tr>
             <th>Item Description</th>
             <th>Due Date</th>
             <th>Amount Due</th>
           </tr>
         </thead>
         <tbody>
           <tr>
             <td>Weekly Service Charge</td>
             <td>${dueDate}</td>
             <td><strong>${formattedAmount}</strong></td>
           </tr>
         </tbody>
       </table>
     </div>
     <p>Please submit payment via bank transfer or at the manager's office on or before the due date to keep your ledger in good standing.</p>`,
    { text: "View Ledger Portal", url: "https://app.mattysplace.org.uk/my-ledger" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Reminder: Service Charge Due Soon (${formattedAmount})`,
    html,
  });
}

// 5. Support Session Reminder
export async function sendSessionReminder(to: string, tenantName: string, sessionTime: string) {
  if (!process.env.RESEND_API_KEY) return;

  const html = emailTemplate(
    "Upcoming Support Session Reminder",
    `<p>Hello ${tenantName},</p>
     <p>This is a reminder that you have a support planning session scheduled with your designated housing officer tomorrow.</p>
     <div class="table-container">
       <table>
         <tbody>
           <tr>
             <td><strong>Scheduled Time:</strong></td>
             <td>${sessionTime}</td>
           </tr>
           <tr>
             <td><strong>Location:</strong></td>
             <td>On-Site Office</td>
           </tr>
         </tbody>
       </table>
     </div>
     <p>Support planning sessions are a mandatory part of your tenancy license compliance. If you need to reschedule, please notify the housing office immediately.</p>`,
    { text: "Open Tenant Portal", url: "https://app.mattysplace.org.uk/my-home" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Reminder: Support Session Scheduled for Tomorrow",
    html,
  });
}

// 6. Housing Benefit Risk Alert (To Manager / Staff)
export async function sendHBAlert(to: string, managerName: string, tenantsWithIssues: Array<{ name: string; status: string }>) {
  if (!process.env.RESEND_API_KEY) return;

  const rows = tenantsWithIssues
    .map(t => `<tr><td>${t.name}</td><td><span style="color: ${t.status === 'suspended' ? '#EF4444' : '#F59E0B'}">${t.status.toUpperCase()}</span></td></tr>`)
    .join("");

  const html = emailTemplate(
    "Housing Benefit Action Needed",
    `<div class="badge badge-alert">⚠️ REVENUE RISK ALERT</div>
     <p>Dear ${managerName},</p>
     <p>Our daily compliance scan has detected Housing Benefit risks that require immediate action to prevent rental shortfalls.</p>
     <div class="table-container">
       <table>
         <thead>
           <tr>
             <th>Tenant Name</th>
             <th>HB Status</th>
           </tr>
         </thead>
         <tbody>
           ${rows}
         </tbody>
       </table>
     </div>
     <p>Please contact the local authority benefit offices directly to resolve these claims.</p>`,
    { text: "Open Compliance Dashboard", url: "https://app.mattysplace.org.uk/dashboard" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `⚠️ ACTION REQUIRED: ${tenantsWithIssues.length} Housing Benefit Risks Detected`,
    html,
  });
}

// 7. Maintenance Logged Acknowledgment
export async function sendMaintenanceAck(to: string, tenantName: string, issueTitle: string, ticketId: string) {
  if (!process.env.RESEND_API_KEY) return;

  const html = emailTemplate(
    "Maintenance Request Logged",
    `<p>Hello ${tenantName},</p>
     <p>Thank you for submitting a maintenance report. We have received your request and logged it under ticket ref <strong>#${ticketId.slice(0, 8)}</strong>.</p>
     <div class="table-container">
       <table>
         <tbody>
           <tr>
             <td><strong>Issue Reported:</strong></td>
             <td>${issueTitle}</td>
           </tr>
           <tr>
             <td><strong>Status:</strong></td>
             <td>Pending Contractor Assignment</td>
           </tr>
         </tbody>
       </table>
     </div>
     <p>A support worker or approved contractor will contact you shortly to coordinate access to your room.</p>`,
    { text: "Track Ticket Status", url: "https://app.mattysplace.org.uk/my-home" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Maintenance Request Logged (#${ticketId.slice(0, 8)})`,
    html,
  });
}

// 8. Maintenance Resolved
export async function sendMaintenanceResolved(to: string, tenantName: string, issueTitle: string) {
  if (!process.env.RESEND_API_KEY) return;

  const html = emailTemplate(
    "Maintenance Ticket Resolved",
    `<p>Hello ${tenantName},</p>
     <p>Good news! Your reported maintenance issue <strong>"${issueTitle}"</strong> has been marked as <strong>Resolved</strong> by our housing management team.</p>
     <p>If the issue is still occurring, or if the repair was unsatisfactory, please log a new report through your Tenant Portal immediately.</p>`,
    { text: "Open Tenant Portal", url: "https://app.mattysplace.org.uk/my-home" }
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Resolved: Maintenance Request Completed`,
    html,
  });
}
