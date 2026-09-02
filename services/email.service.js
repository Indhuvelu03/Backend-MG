// services/email.service.js — Executive Corporate Email Dispatcher
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { Dealership } from "../models/Dealership.js";
import { FeedbackLink } from "../models/FeedbackLink.js";

const resend = new Resend(env.RESEND_API_KEY);
const FROM   = env.RESEND_FROM_EMAIL;
const APP    = "AutoAudit AI";

// ── Shared Professional Corporate HTML Shell (Zero Emojis, Neutral Slate Palette) ─────
const shell = (title, body, branchName = "Service Center") => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP}</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(0,0,0,0.05);max-width:580px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0F172A;padding:20px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:14px;font-weight:700;color:#ffffff;letter-spacing:0.04em;">${APP.toUpperCase()}</span>
                  <span style="font-size:11px;color:#94A3B8;margin-left:8px;letter-spacing:0.05em;text-transform:uppercase;">| Enterprise System</span>
                </td>
                <td align="right" style="font-size:12px;color:#CBD5E1;font-weight:500;">
                  ${branchName}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title Bar -->
        <tr>
          <td style="background:#F1F5F9;padding:18px 32px;border-bottom:1px solid #E2E8F0;">
            <h1 style="margin:0;font-size:16px;font-weight:700;color:#0F172A;letter-spacing:-0.01em;">
              ${title}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:32px;color:#334155;font-size:14px;line-height:1.65;">${body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:24px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;">${branchName}</p>
            <p style="margin:0;font-size:11px;color:#94A3B8;line-height:1.5;">
              This is an automated system notification issued by ${APP}.<br/>
              Confidentiality Notice: This message is intended strictly for the specified recipient. Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Shared Corporate Components ────────────────────────────────────────────────
const vehiclePill = (vehicleNumber, model, centerName) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#64748B;text-transform:uppercase;">Vehicle Registration</p>
              <p style="margin:4px 0 0;font-size:20px;font-weight:700;font-family:'Courier New',Consolas,monospace;color:#0F172A;letter-spacing:0.05em;">${vehicleNumber}</p>
              ${model ? `<p style="margin:2px 0 0;font-size:13px;color:#475569;font-weight:500;">${model}</p>` : ""}
            </td>
            ${centerName ? `
            <td align="right" style="vertical-align:top;">
              <span style="font-size:11px;font-weight:600;color:#475569;background:#EDF2F7;border:1px solid #CBD5E1;padding:4px 10px;border-radius:4px;display:inline-block;">
                ${centerName}
              </span>
            </td>` : ""}
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

const ctaButton = (text, url) => `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0 12px;width:100%;">
    <tr>
      <td align="center" style="background:#0F172A;border-radius:6px;">
        <a href="${url}" style="display:block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;text-align:center;">${text}</a>
      </td>
    </tr>
  </table>`;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. COMPLAINT RECEIVED
// ═══════════════════════════════════════════════════════════════════════════════
export const sendComplaintReceived = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";
  const sc   = customer.service_center || customer.serviceCenter || "Service Center";

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      We confirm receipt of your service request at <strong>${sc}</strong>. Our service management team is reviewing your details.
    </p>
    ${vehiclePill(vNum, vMod, sc)}
    <p style="margin:16px 0 0;font-size:13px;color:#64748B;">
      You will receive automated updates as your service processing advances. No further action is required at this time.
    </p>`;

  return _send(customer.email, `Service Request Confirmation — [${vNum}]`, shell("Service Request Confirmation", body, sc));
  logger.info(`📧 Complaint-received email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VOICE NOTE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════
export const sendVoiceNoteProcessing = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Your recorded voice feedback for vehicle <strong>${vNum}</strong> is currently being processed by our system.
    </p>
    ${vehiclePill(vNum, vMod)}
    <p style="margin:16px 0 0;font-size:13px;color:#64748B;">
      Processing will be completed shortly. You will be notified when your service audit report is available.
    </p>`;

  return _send(customer.email, `Voice Processing Notification — [${vNum}]`, shell("Voice Processing Notification", body));
  logger.info(`📧 Voice-processing email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INVOICE UPLOADED
// ═══════════════════════════════════════════════════════════════════════════════
export const sendInvoiceUploaded = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";
  const sc   = customer.service_center || customer.serviceCenter || "Service Center";

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      The service invoice for vehicle <strong>${vNum}</strong> has been uploaded by <strong>${sc}</strong> and is undergoing verification.
    </p>
    ${vehiclePill(vNum, vMod, sc)}`;

  return _send(customer.email, `Service Invoice Update — [${vNum}]`, shell("Service Invoice Verification", body, sc));
  logger.info(`📧 Invoice-uploaded email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AI AUDIT COMPLETE
// ═══════════════════════════════════════════════════════════════════════════════
export const sendAuditComplete = async (customer, complaint, score, summary, reportUrl) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";

  // Fetch branch name
  let branchName = customer.serviceCenter || customer.service_center || "";
  const dId = customer.dealershipId || customer.dealerId || customer.dealership_id;
  if (dId) {
    try {
      const d = await Dealership.findById(dId);
      if (d?.name) branchName = d.name;
    } catch {}
  }
  if (!branchName) branchName = "Service Center";

  // Reports are private. Customer email always links to the token-protected
  // tracking page instead of exposing a Storage URL or complaint UUID.
  const feedbackLinkId = complaint.feedbackLinkId || complaint.feedback_link_id;
  const feedbackLink = feedbackLinkId ? await FeedbackLink.findById(feedbackLinkId) : null;
  const pdfDownloadUrl = feedbackLink?.token
    ? `${env.CLIENT_URL}/tracking/${feedbackLink.token}`
    : env.CLIENT_URL;

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.65;">
      We are pleased to inform you that your vehicle service verification for <strong>${vNum}</strong> at <strong>${branchName}</strong> has been completed successfully.
    </p>

    ${vehiclePill(vNum, vMod, branchName)}

    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.65;">
      Your service records and invoice items have been cross-checked. You can download your official Service Audit Report (PDF) using the button below.
    </p>

    ${ctaButton("VIEW SERVICE REPORT", pdfDownloadUrl)}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E2E8F0;text-align:left;">
      <p style="margin:0;font-size:12px;color:#64748B;">
        Please present your identification at the service desk upon vehicle pickup. Thank you for choosing ${branchName}.
      </p>
    </div>`;

  return _send(
    customer.email,
    `Service Verification Complete — ${branchName} [${vNum}]`,
    shell("Service Verification Complete", body, branchName)
  );
  logger.info(`📧 Audit complete email with PDF report link sent to customer ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NEEDS REVIEW
// ═══════════════════════════════════════════════════════════════════════════════
export const sendNeedsReview = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Your service record for vehicle <strong>${vNum}</strong> is currently undergoing administrative review. No action is required on your part.
    </p>`;

  return _send(customer.email, `Service Review Notice — [${vNum}]`, shell("Service Review Notice", body));
  logger.info(`📧 Needs-review email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SERVICE FAILURE
// ═══════════════════════════════════════════════════════════════════════════════
export const sendProcessingFailed = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      An issue was encountered while processing your service record for vehicle <strong>${vNum}</strong>. Our support team has been notified and is addressing the matter.
    </p>`;

  return _send(customer.email, `Service System Notice — [${vNum}]`, shell("System Notice", body));
  logger.info(`📧 Processing-failed email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FEEDBACK INVITE — Professional Executive Corporate Format (Zero Emojis)
// ═══════════════════════════════════════════════════════════════════════════════
export const sendFeedbackInvite = async (customer, link) => {
  if (!customer?.email) {
    logger.warn(`Skipping invite: ${customer?.name} has no email`);
    return;
  }

  // Lookup Dealership branch name
  let branchName = customer.serviceCenter || customer.service_center || "";
  const dId = customer.dealershipId || customer.dealerId || customer.dealership_id;
  if (dId) {
    try {
      const d = await Dealership.findById(dId);
      if (d?.name) branchName = d.name;
    } catch {}
  }
  if (!branchName || branchName.toLowerCase().includes("downtown")) {
    branchName = "Service Center";
  }

  const feedbackUrl = `${env.PUBLIC_FEEDBACK_BASE_URL}/${link.token}`;
  const expiryDate  = link.expires_at || link.expiresAt
    ? new Date(link.expires_at || link.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "7 days from date of issue";
  const vNum        = customer.vehicle_number || customer.vehicleNumber || "";
  const vMod        = customer.vehicle_model  || customer.vehicleModel  || "";

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.65;">
      Thank you for servicing your vehicle with <strong>${branchName}</strong>. To assist us in maintaining quality standards, we request a brief 30-second voice feedback regarding your service experience.
    </p>

    ${vehiclePill(vNum, vMod, branchName)}

    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.65;">
      Please select the link below to submit your audio recording. No application download or login credentials are required.
    </p>

    ${ctaButton("RECORD SERVICE FEEDBACK", feedbackUrl)}

    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #E2E8F0;text-align:left;">
      <p style="margin:0;font-size:12px;color:#64748B;">
        <strong>Security Notice:</strong> This link is unique to your vehicle record and valid until <strong>${expiryDate}</strong>.
      </p>
    </div>`;

  return _send(
    customer.email,
    `Service Feedback Request — ${branchName} [${vNum}]`,
    shell("Service Feedback Request", body, branchName)
  );
  logger.info(`📧 Feedback invite email sent to ${customer.email} for ${branchName}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. STATUS UPDATE
// ═══════════════════════════════════════════════════════════════════════════════
export const sendStatusUpdate = async (customer, status, vehicleNumber) => {
  if (!customer?.email) return;

  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Dear ${customer.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Your service record status for vehicle <strong>${vehicleNumber}</strong> has been updated to: <strong>${status}</strong>.
    </p>`;

  return _send(customer.email, `Service Status Update — [${vehicleNumber}]`, shell("Service Status Update", body));
  logger.info(`📧 Status-update email sent to ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FRAUD ESCALATION
// ═══════════════════════════════════════════════════════════════════════════════
export const sendFraudEscalation = async ({ managerEmail, customerName, vehicleNumber, score, summary, matchedIssues, missingIssues }) => {
  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Management Escalation Notice</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      A system discrepancy alert has been generated for customer <strong>${customerName}</strong> (Vehicle: <strong>${vehicleNumber}</strong>).
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:20px;">
      <tr><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#475569;background:#F8FAFC;border-bottom:1px solid #E2E8F0;" colspan="2">Audit Details</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748B;border-bottom:1px solid #E2E8F0;">Customer Name</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0F172A;border-bottom:1px solid #E2E8F0;">${customerName}</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748B;border-bottom:1px solid #E2E8F0;">Vehicle Registration</td><td style="padding:10px 16px;font-size:13px;font-weight:700;font-family:monospace;color:#0F172A;border-bottom:1px solid #E2E8F0;">${vehicleNumber}</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748B;">Audit Score</td><td style="padding:10px 16px;font-size:16px;font-weight:700;color:#0F172A;">${score}%</td></tr>
    </table>
    ${summary ? `<p style="font-size:13px;color:#475569;margin-bottom:16px;"><strong>Summary:</strong> ${summary}</p>` : ""}
    <p style="margin:0;font-size:12px;color:#64748B;">Please log into the management console to review the complete record.</p>`;

  return _send(managerEmail, `Management Discrepancy Alert — [${vehicleNumber}]`, shell("Management Discrepancy Alert", body));
  logger.info(`📧 Fraud-escalation email sent to ${managerEmail}`);
};

export const sendSlaEscalation = async ({ managerEmail, customerName, vehicleNumber, status, ageMinutes }) => {
  const body = `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">SLA Management Alert</p><p style="font-size:14px;color:#475569;">Vehicle <strong>${vehicleNumber}</strong> (${customerName}) has remained in status <strong>${status}</strong> for ${ageMinutes} minutes.</p>`;
  return _send(managerEmail, `SLA Alert: ${vehicleNumber}`, shell("SLA Management Alert", body));
  logger.info(`SLA escalation sent to ${managerEmail} for ${vehicleNumber}`);
};

export const sendPasswordReset = async (user, resetUrl, expiresMinutes) => {
  const body = `
    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0F172A;">Hello ${user.name},</p>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.65;">
      A password reset was requested for your AutoAudit AI account. This secure link expires in ${expiresMinutes} minutes and can be used only once.
    </p>
    ${ctaButton("RESET PASSWORD", resetUrl)}
    <p style="margin:20px 0 0;font-size:12px;color:#64748B;line-height:1.6;">
      If you did not request this change, ignore this email. Your password will remain unchanged.
    </p>`;
  return _send(user.email, "Reset your AutoAudit AI password", shell("Secure Password Reset", body));
};

// ── Internal Send Helper ───────────────────────────────────────────────────────
const _send = async (to, subject, html) => {
  console.log(`\n=================== [EMAIL DISPATCH ATTEMPT] ===================`);
  console.log(`📩 Target Recipient : ${to}`);
  console.log(`📋 Subject          : ${subject}`);
  console.log(`================================================================`);

  try {
    const smtpUser   = process.env.SMTP_USER || process.env.GMAIL_USER;
    const smtpPass   = process.env.SMTP_PASS || process.env.GMAIL_PASS;
    const smtpHost   = process.env.SMTP_HOST;
    const smtpPort   = Number(process.env.SMTP_PORT || 587);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpFrom   = process.env.SMTP_FROM_EMAIL || `${APP} <${smtpUser}>`;

    if (smtpUser && smtpPass) {
      console.log(`⚙️ Provider: SMTP Relay (${smtpUser})`);
      const transporter = smtpHost
        ? nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: { user: smtpUser, pass: smtpPass },
          })
        : nodemailer.createTransport({
            service: "gmail",
            auth: { user: smtpUser, pass: smtpPass },
          });
      const info = await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        html,
      });
      console.log(`✅ [EMAIL SUCCESS - SMTP] Message ID: ${info.messageId}`);
      logger.info(`📧 Email sent via SMTP to ${to} (ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId, status: "sent", provider: "smtp" };
    }

    if (!env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("dummy")) {
      console.warn(`⚠️ [EMAIL SKIPPED] No SMTP or Resend API key configured for ${to}`);
      logger.warn(`⚠️ Neither SMTP nor RESEND_API_KEY is configured — email to ${to} skipped.`);
      throw new Error("No email provider is configured");
    }

    console.log(`⚙️ Provider: Resend API (From: ${FROM})`);
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

    if (error) {
      console.error(`❌ [EMAIL ERROR - RESEND API REJECTED]:`, JSON.stringify(error, null, 2));
      logger.error(`❌ Resend API error [${to}]: ${error.message || JSON.stringify(error)}`);
      throw new Error(`Resend API Error: ${error.message || JSON.stringify(error)}`);
    }

    console.log(`✅ [EMAIL SUCCESS - RESEND] Message ID: ${data?.id || 'OK'}`);
    logger.info(`📧 Email sent via Resend to ${to} (Message ID: ${data?.id || 'ok'})`);
    return { success: true, messageId: data?.id || null, status: "sent", provider: "resend" };
  } catch (err) {
    console.error(`❌ [EMAIL DISPATCH FAILED FOR ${to}]:`, err.message || err);
    logger.error(`❌ Email dispatch failed [${to}]: ${err.stack || err.message}`);
    throw err;
  }
};
