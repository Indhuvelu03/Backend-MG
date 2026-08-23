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
}) : null;

export const EmailActivity = {
  async record({ customer, stage, status = "SENT", channel = "email", detail = null }) {
    const { error } = await supabase.from(TABLE).insert({
      customer_id: customer?.id || customer?._id || null,
      customer_name: customer?.name || "Customer",
      vehicle_number: customer?.vehicleNumber || customer?.vehicle_number || "—",
      recipient: customer?.email || null,
      stage,
      status,
      channel,
      detail,
      sent_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  },

  async list({ limit = 100 } = {}) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 250));
    if (error) throw new Error(error.message);
    return (data || []).map(normalise);
  },
};
