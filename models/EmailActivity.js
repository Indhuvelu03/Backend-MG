import { supabase } from "../config/supabase.js";

const TABLE = "email_activities";

const normalise = (row) => row ? ({
  ...row,
  _id: row.id,
  customerId: row.customer_id,
  vehicleNumber: row.vehicle_number,
  customerName: row.customer_name,
  stage: row.stage,
  sentAt: row.sent_at,
  providerMessageId: row.provider_message_id,
  providerStatus: row.provider_status,
  providerErrorCode: row.provider_error_code,
  deliveredAt: row.delivered_at,
  jobName: row.job_name,
  jobData: row.job_data,
}) : null;

export const EmailActivity = {
  async record({
    customer,
    stage,
    status = "SENT",
    channel = "email",
    detail = null,
    recipient,
    providerMessageId = null,
    providerStatus = null,
    jobName = null,
    jobData = null,
  }) {
    const basePayload = {
      customer_id: customer?.id || customer?._id || null,
      dealership_id: customer?.dealershipId || customer?.dealership_id || null,
      customer_name: customer?.name || "Customer",
      vehicle_number: customer?.vehicleNumber || customer?.vehicle_number || "—",
      recipient: recipient || (channel === "email" ? customer?.email : customer?.mobile) || null,
      stage,
      status,
      channel,
      detail,
      sent_at: new Date().toISOString(),
    };
    const enhancedPayload = {
      ...basePayload,
      provider_message_id: providerMessageId,
      provider_status: providerStatus,
      job_name: jobName,
      job_data: jobData,
    };

    let { data, error } = await supabase.from(TABLE).insert(enhancedPayload).select().single();
    if (error && /provider_message_id|provider_status|job_name|job_data/i.test(error.message)) {
      const fallback = await supabase.from(TABLE).insert(basePayload).select().single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw new Error(error.message);
    return normalise(data);
  },

  async updateProviderStatus({ providerMessageId, status, errorCode, errorMessage }) {
    const normalizedStatus = String(status || "unknown").toUpperCase();
    const updates = {
      provider_status: normalizedStatus,
      status: ["FAILED", "UNDELIVERED"].includes(normalizedStatus) ? "FAILED" : normalizedStatus,
      provider_error_code: errorCode ? String(errorCode) : null,
    };
    if (errorMessage) updates.detail = errorMessage;
    if (["DELIVERED", "READ"].includes(normalizedStatus)) updates.delivered_at = new Date().toISOString();
    const query = supabase
      .from(TABLE)
      .update(updates)
      .eq("provider_message_id", providerMessageId);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(error.message);
    return normalise(data);
  },

  async list({ limit = 100, dealershipId } = {}) {
    let query = supabase
      .from(TABLE)
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));
    if (dealershipId) query = query.eq("dealership_id", dealershipId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(normalise);
  },

  async wasSent({ customerId, stage, channel }) {
    if (!customerId || !stage || !channel) return false;
    const { data, error } = await supabase
      .from(TABLE)
      .select("id")
      .eq("customer_id", customerId)
      .eq("stage", stage)
      .eq("channel", channel)
      .eq("status", "SENT")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  },
};
