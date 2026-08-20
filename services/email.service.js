// services/email.service.js — Full customer lifecycle notifications via Resend & Nodemailer SMTP
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const resend = new Resend(env.RESEND_API_KEY);
const FROM   = env.RESEND_FROM_EMAIL;
const APP    = "AutoAudit AI";

// ── Shared HTML shell ──────────────────────────────────────────────────────────
const shell = (accentColor, headerIcon, headerTitle, body) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP}</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:28px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.7);text-transform:uppercase;">${APP}</p>
                  <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#fff;">${headerIcon}&nbsp; ${headerTitle}</h1>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:36px;">${body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E4E4E7;padding:20px 36px;">
            <p style="margin:0;font-size:11px;color:#A1A1AA;text-align:center;">
              This is an automated message from ${APP} &mdash; Vehicle Service Intelligence Platform.<br/>
              Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Shared components ──────────────────────────────────────────────────────────
const vehiclePill = (vehicleNumber, model) => `
  <table cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background:#F4F4F5;border:1px solid #E4E4E7;border-radius:8px;padding:14px 20px;">
        <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;color:#71717A;text-transform:uppercase;">Vehicle on Service</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:700;font-family:monospace;color:#18181B;letter-spacing:0.06em;">${vehicleNumber}</p>
        ${model ? `<p style="margin:2px 0 0;font-size:13px;color:#71717A;">${model}</p>` : ""}
      </td>
    </tr>
  </table>`;

const statusBadge = (label, color, bgColor) => `
  <span style="display:inline-block;background:${bgColor};color:${color};padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:0.05em;">${label}</span>`;

const timeline = (steps) => `
  <table cellpadding="0" cellspacing="0" style="width:100%;margin:24px 0;">
    ${steps.map(({ label, done, active }) => `
    <tr>
      <td style="width:32px;vertical-align:top;padding-bottom:4px;">
        <div style="width:24px;height:24px;border-radius:50%;background:${done ? "#18181B" : active ? "#2563EB" : "#E4E4E7"};display:flex;align-items:center;justify-content:center;text-align:center;line-height:24px;font-size:13px;font-weight:700;color:${done || active ? "#fff" : "#A1A1AA"};">${done ? "✓" : active ? "●" : "○"}</div>
      </td>
      <td style="vertical-align:top;padding:3px 0 4px 10px;">
        <p style="margin:0;font-size:13px;font-weight:${active ? "700" : "400"};color:${done ? "#18181B" : active ? "#2563EB" : "#A1A1AA"};">${label}</p>
      </td>
    </tr>`).join("")}
  </table>`;

const ctaButton = (text, url, color = "#18181B") => `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
    <tr>
      <td style="background:${color};border-radius:8px;">
        <a href="${url}" style="display:block;padding:14px 28px;color:#fff;font-size:14px;font-weight:700;text-decoration:none;">${text} &rarr;</a>
      </td>
    </tr>
  </table>`;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. COMPLAINT RECEIVED — fired when customer submits voice complaint
// ═══════════════════════════════════════════════════════════════════════════════
export const sendComplaintReceived = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum  = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod  = customer.vehicle_model || customer.vehicleModel || "";
  const sc    = customer.service_center || customer.serviceCenter || "our service center";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Hello, ${customer.name} 👋</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      We've received your service complaint for your vehicle at <strong>${sc}</strong>.
      Our team is now reviewing your request.
    </p>
    ${vehiclePill(vNum, vMod)}
    ${timeline([
      { label: "Complaint Received",         done: true,  active: false },
      { label: "Voice Note Being Processed", done: false, active: true  },
      { label: "Invoice Verification",       done: false, active: false },
      { label: "AI Audit Complete",          done: false, active: false },
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
      We'll send you another update as soon as your voice note has been processed. You don't need to call us &mdash; we'll keep you informed at every step.
    </p>`;

  await _send(customer.email, `Complaint Received — ${vNum}`, shell("#18181B", "📋", "Complaint Received", body));
  logger.info(`📧 Complaint-received email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VOICE NOTE PROCESSING — fired when transcription starts
// ═══════════════════════════════════════════════════════════════════════════════
export const sendVoiceNoteProcessing = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Your voice note is being processed</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      We've received your voice recording and our AI (Groq Whisper) is now transcribing it into text for review.
    </p>
    ${vehiclePill(vNum, vMod)}
    ${timeline([
      { label: "Complaint Received",         done: true,  active: false },
      { label: "Voice Note Being Processed", done: false, active: true  },
      { label: "Invoice Verification",       done: false, active: false },
      { label: "AI Audit Complete",          done: false, active: false },
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
      This usually takes less than a minute. We'll email you once your transcript is ready.
    </p>`;

  await _send(customer.email, `Voice Note Processing — ${vNum}`, shell("#2563EB", "🎙️", "Voice Note Processing", body));
  logger.info(`📧 Voice-processing email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INVOICE UPLOADED — fired when service center uploads the invoice
// ═══════════════════════════════════════════════════════════════════════════════
export const sendInvoiceUploaded = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";
  const sc   = customer.service_center || customer.serviceCenter || "our service center";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Service invoice received</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      <strong>${sc}</strong> has uploaded your service invoice.
      Our AI system is now extracting and verifying all billed line items.
    </p>
    ${vehiclePill(vNum, vMod)}
    ${timeline([
      { label: "Complaint Received",         done: true,  active: false },
      { label: "Voice Note Processed",       done: true,  active: false },
      { label: "Invoice Received & Verifying",done: false, active: true },
      { label: "AI Audit Complete",          done: false, active: false },
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
      The AI will cross-check your voice complaint against every item on the invoice.
      You'll get the full audit report shortly.
    </p>`;

  await _send(customer.email, `Invoice Received — ${vNum}`, shell("#7C3AED", "📄", "Invoice Received", body));
  logger.info(`📧 Invoice-uploaded email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AI AUDIT COMPLETE — Match vs Mismatch Customer Messages
// ═══════════════════════════════════════════════════════════════════════════════
export const sendAuditComplete = async (customer, complaint, score, summary) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";
  const sc   = customer.service_center || customer.serviceCenter || "our service center";

  const isMatch = score >= 80;

  if (isMatch) {
    // 🟢 MATCH: Clean, reassuring ready-for-handover message
    const body = `
      <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Great news, ${customer.name}! 👋</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525B;line-height:1.7;">
        All reported issues for your vehicle have been thoroughly inspected, serviced, and verified against your final invoice at <strong>${sc}</strong>.
      </p>
      ${vehiclePill(vNum, vMod)}
      
      <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:18px 22px;margin:20px 0;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#047857;">✅ Service Verified & Ready for Pickup</p>
        <p style="margin:6px 0 0;font-size:13px;color:#065F46;line-height:1.6;">
          Your voice complaints and requested service items have been successfully completed and cross-checked. Your vehicle is ready for handover.
        </p>
      </div>

      ${timeline([
        { label: "Complaint Received",      done: true, active: false },
        { label: "Voice Note Processed",    done: true, active: false },
        { label: "Invoice Verified",        done: true, active: false },
        { label: "Service Verified & Ready",done: true, active: false },
      ])}

      <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
        Thank you for choosing ${sc}. Please bring your photo ID when collecting your vehicle.
      </p>`;

    await _send(customer.email, `Vehicle Service Verified & Ready — ${vNum}`, shell("#059669", "✅", "Service Verified & Ready", body));
    logger.info(`📧 Audit-match customer email sent → ${customer.email}`);
  } else {
    // 🟡 MISMATCH: Customer reassurance email (Quality Assurance review)
    const body = `
      <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Dear ${customer.name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525B;line-height:1.7;">
        Your vehicle service at <strong>${sc}</strong> is currently undergoing a final Quality Assurance & Audit Review by our Senior Service Manager to ensure all your requested service points are completely fulfilled.
      </p>
      ${vehiclePill(vNum, vMod)}

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:18px 22px;margin:20px 0;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#B45309;">🔍 Final Quality Inspection in Progress</p>
        <p style="margin:6px 0 0;font-size:13px;color:#92400E;line-height:1.6;">
          We take service quality seriously. Our management team is doing a double-check on all customer notes before final vehicle handover.
        </p>
      </div>

      ${timeline([
        { label: "Complaint Received",     done: true, active: false },
        { label: "Voice Note Processed",   done: true, active: false },
        { label: "Invoice Uploaded",       done: true, active: false },
        { label: "Quality Audit Review",   done: false, active: true },
      ])}

      <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
        You don't need to take any action. We will send you a final confirmation as soon as Quality Assurance is complete.
      </p>`;

    await _send(customer.email, `Service Update: Final Quality Review — ${vNum}`, shell("#D97706", "🔍", "Under Final Quality Review", body));
    logger.info(`📧 Audit-mismatch QA customer email sent → ${customer.email}`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NEEDS REVIEW — fired when confidence is too low for auto-processing
// ═══════════════════════════════════════════════════════════════════════════════
export const sendNeedsReview = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const vMod = customer.vehicle_model || customer.vehicleModel || "";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Manual review in progress</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      Your voice recording quality required our team to step in for a manual review.
      This is a routine check and won't cause any delay to your service.
    </p>
    ${vehiclePill(vNum, vMod)}
    ${timeline([
      { label: "Complaint Received",    done: true,  active: false },
      { label: "Voice Note Received",   done: true,  active: false },
      { label: "Manual Review in Progress", done: false, active: true },
      { label: "AI Audit Complete",     done: false, active: false },
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:#71717A;line-height:1.6;">
      Our team typically completes manual reviews within a few hours. We'll email you with the final audit result.
    </p>`;

  await _send(customer.email, `Update: Manual Review — ${vNum}`, shell("#D97706", "🔍", "Manual Review in Progress", body));
  logger.info(`📧 Needs-review email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SERVICE FAILURE — fired when any processing step fails
// ═══════════════════════════════════════════════════════════════════════════════
export const sendProcessingFailed = async (customer, complaint) => {
  if (!customer?.email) return;
  const vNum = complaint.vehicleNumber || complaint.vehicle_number;
  const sc   = customer.service_center || customer.serviceCenter || "our service center";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">We ran into an issue</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      We encountered a technical problem while processing your service record for vehicle
      <strong>${vNum}</strong>. Our team at <strong>${sc}</strong> has been notified and
      will resolve this shortly.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#991B1B;font-weight:600;">
        No action is required from you. We apologise for the inconvenience.
      </p>
    </div>
    <p style="font-size:13px;color:#71717A;line-height:1.6;margin:0;">
      If this issue persists, please contact your service advisor directly.
    </p>`;

  await _send(customer.email, `Action Required: Service Record Issue — ${vNum}`, shell("#DC2626", "⚠️", "Processing Issue", body));
  logger.info(`📧 Processing-failed email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FEEDBACK INVITE — existing function (kept + redesigned)
// ═══════════════════════════════════════════════════════════════════════════════
export const sendFeedbackInvite = async (customer, link) => {
  if (!customer?.email) {
    logger.warn(`Skipping invite: ${customer?.name} has no email`);
    return;
  }

  const feedbackUrl  = `${env.PUBLIC_FEEDBACK_BASE_URL}/${link.token}`;
  const expiryDate   = link.expires_at || link.expiresAt
    ? new Date(link.expires_at || link.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "7 days from now";
  const vNum         = customer.vehicle_number || customer.vehicleNumber || "";
  const vMod         = customer.vehicle_model  || customer.vehicleModel  || "";
  const sc           = customer.service_center || customer.serviceCenter || "our service center";

  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Dear ${customer.name},</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#52525B;line-height:1.7;">
      Thank you for choosing <strong>${sc}</strong> for your vehicle service.
      We'd love to hear your experience — it only takes 30 seconds.
    </p>
    ${vehiclePill(vNum, vMod)}
    <p style="font-size:14px;color:#52525B;line-height:1.7;margin:0 0 24px;">
      Click the button below to record a short voice message about your service visit.
      <strong>No login required.</strong>
    </p>
    ${ctaButton("Record Voice Feedback", feedbackUrl, "#18181B")}
    <p style="margin:20px 0 0;font-size:11px;color:#A1A1AA;">
      🔒 This link is secure, one-time use, and expires on <strong>${expiryDate}</strong>.
    </p>`;

  await _send(customer.email, `Share Your Feedback — ${vNum}`, shell("#18181B", "🎙️", "Share Your Service Feedback", body));
  logger.info(`📧 Feedback-invite email → ${customer.email}`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. STATUS UPDATE — generic fallback (kept for backward compat)
// ═══════════════════════════════════════════════════════════════════════════════
export const sendStatusUpdate = async (customer, status, vehicleNumber) => {
  if (!customer?.email) return;

  const statusConfig = {
    AUDIO_UPLOADED:   { color: "#2563EB", icon: "🎙️", label: "Voice Note Received",   msg: "Your voice complaint has been received. Our AI is now processing it." },
    TRANSCRIBED:      { color: "#7C3AED", icon: "📝", label: "Transcript Ready",       msg: "Your voice complaint has been transcribed and is under AI review." },
    COMPARED:         { color: "#059669", icon: "✅", label: "Audit Complete",          msg: "Your AI audit is complete. Your report is ready." },
    INVOICE_UPLOADED: { color: "#7C3AED", icon: "📄", label: "Invoice Received",       msg: "Your service invoice has been uploaded and is being verified." },
    NEEDS_REVIEW:     { color: "#D97706", icon: "🔍", label: "Under Manual Review",    msg: "Your record requires manual review. Our team will handle it shortly." },
    FAILED:           { color: "#DC2626", icon: "⚠️", label: "Processing Issue",       msg: "There was an issue processing your service record. Our team has been notified." },
  };

  const cfg  = statusConfig[status] || { color: "#18181B", icon: "ℹ️", label: status, msg: `Your service record status: ${status}` };
  const body = `
    <h2 style="margin:0 0 6px;font-size:18px;color:#18181B;">Service Update</h2>
    <p style="font-size:14px;color:#52525B;margin:0 0 4px;">Dear <strong>${customer.name}</strong>,</p>
    <div style="background:#F9FAFB;border-left:4px solid ${cfg.color};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:14px;font-weight:600;color:${cfg.color};">${cfg.icon} ${cfg.label}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#52525B;">${cfg.msg}</p>
    </div>
    <p style="font-size:13px;color:#A1A1AA;margin:0;">Vehicle: <strong style="color:#18181B;">${vehicleNumber}</strong></p>`;

  await _send(customer.email, `Service Update: ${cfg.label} — ${vehicleNumber}`, shell(cfg.color, cfg.icon, cfg.label, body));
  logger.info(`📧 Status-update email → ${customer.email} (${status})`);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FRAUD ESCALATION — alert to manager (redesigned)
// ═══════════════════════════════════════════════════════════════════════════════
export const sendFraudEscalation = async ({ managerEmail, customerName, vehicleNumber, score, summary, matchedIssues, missingIssues }) => {
  const missing = Array.isArray(missingIssues) && missingIssues.length
    ? `<div style="margin-top:16px;"><h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991B1B;">Issues Reported by Customer — NOT in Invoice</h3>
       <ul style="margin:0;padding-left:20px;color:#DC2626;">
         ${missingIssues.map(i => `<li style="margin-bottom:4px;font-size:13px;">${i}</li>`).join("")}
       </ul></div>` : "";

  const matched = Array.isArray(matchedIssues) && matchedIssues.length
    ? `<div style="margin-top:12px;"><h3 style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;">Verified Matches</h3>
       <ul style="margin:0;padding-left:20px;color:#059669;">
         ${matchedIssues.map(i => `<li style="margin-bottom:4px;font-size:13px;">${i}</li>`).join("")}
       </ul></div>` : "";

  const body = `
    <h2 style="margin:0 0 4px;font-size:18px;color:#18181B;">Fraud Alert Triggered</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#52525B;">An AI audit has flagged a significant mismatch between a customer's voice complaint and their service invoice.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #E4E4E7;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <tr style="background:#F9FAFB;"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#71717A;letter-spacing:0.06em;text-transform:uppercase;" colspan="2">Case Details</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#71717A;border-top:1px solid #E4E4E7;">Customer</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#18181B;border-top:1px solid #E4E4E7;">${customerName}</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#71717A;border-top:1px solid #E4E4E7;">Vehicle</td><td style="padding:10px 16px;font-size:13px;font-weight:700;font-family:monospace;color:#18181B;border-top:1px solid #E4E4E7;letter-spacing:0.05em;">${vehicleNumber}</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#71717A;border-top:1px solid #E4E4E7;">AI Match Score</td><td style="padding:10px 16px;font-size:22px;font-weight:800;color:#DC2626;border-top:1px solid #E4E4E7;">${score}%</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#71717A;border-top:1px solid #E4E4E7;">Verdict</td><td style="padding:10px 16px;border-top:1px solid #E4E4E7;"><span style="background:#FEF2F2;color:#DC2626;padding:3px 10px;border-radius:100px;font-size:12px;font-weight:700;">HIGH MISMATCH — REVIEW REQUIRED</span></td></tr>
    </table>
    ${summary ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px 20px;margin-bottom:16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#991B1B;text-transform:uppercase;letter-spacing:0.08em;">AI Analysis Summary</p><p style="margin:0;font-size:13px;color:#7F1D1D;line-height:1.6;">${summary}</p></div>` : ""}
    ${missing}${matched}
    <p style="margin:20px 0 0;font-size:12px;color:#A1A1AA;">Generated automatically by ${APP}. Log into the admin dashboard to review the full report.</p>`;

  await _send(managerEmail, `[FRAUD ALERT] ${vehicleNumber} — AI Score: ${score}%`, shell("#DC2626", "⚠️", "Fraud Alert — Immediate Review Required", body));
  logger.info(`📧 Fraud-escalation email → ${managerEmail} (vehicle: ${vehicleNumber}, score: ${score}%)`);
};

// ── Internal send helper ───────────────────────────────────────────────────────
const _send = async (to, subject, html) => {
  console.log(`\n=================== [EMAIL DISPATCH ATTEMPT] ===================`);
  console.log(`📩 Target Recipient : ${to}`);
  console.log(`📋 Subject          : ${subject}`);
  console.log(`================================================================`);

  try {
    const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;

    if (smtpUser && smtpPass) {
      console.log(`⚙️ Provider: Gmail SMTP (${smtpUser})`);
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: smtpPass },
      });
      const info = await transporter.sendMail({
        from: `${APP} <${smtpUser}>`,
        to,
        subject,
        html,
      });
      console.log(`✅ [EMAIL SUCCESS - GMAIL SMTP] Message ID: ${info.messageId}`);
      logger.info(`📧 Email sent via Gmail SMTP to ${to} (ID: ${info.messageId})`);
      return;
    }

    if (!env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("dummy")) {
      console.warn(`⚠️ [EMAIL SKIPPED] No SMTP or Resend API key configured for ${to}`);
      logger.warn(`⚠️ Neither SMTP nor RESEND_API_KEY is configured — email to ${to} skipped.`);
      return;
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
  } catch (err) {
    console.error(`❌ [EMAIL DISPATCH FAILED FOR ${to}]:`, err.message || err);
    logger.error(`❌ Email dispatch failed [${to}]: ${err.stack || err.message}`);
    throw err;
  }
};