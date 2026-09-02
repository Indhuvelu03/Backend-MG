import { supabase } from "../config/supabase.js";
import { getEffectiveTenantId } from "../middleware/tenant.middleware.js";
import { sendSuccess } from "../utils/responseHandler.js";

const getEvents = async req => {
  const dealershipId = getEffectiveTenantId(req, req.query.dealershipId);
  let query = supabase.from("security_events").select("id,user_id,dealership_id,event_type,success,ip_address,user_agent,metadata,created_at").order("created_at", { ascending: false }).limit(Math.min(Number(req.query.limit) || 250, 1000));
  if (dealershipId) query = query.eq("dealership_id", dealershipId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
};

export const listSecurityEvents = async (req, res, next) => {
  try { sendSuccess(res, "Security events retrieved", await getEvents(req), 200); } catch (error) { next(error); }
};

const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;

export const exportSecurityEvents = async (req, res, next) => {
  try {
    const events = await getEvents(req);
    const header = ["Time", "Event", "Success", "User ID", "Dealership ID", "IP Address", "User Agent"];
    const rows = events.map(event => [event.created_at, event.event_type, event.success, event.user_id, event.dealership_id, event.ip_address, event.user_agent]);
    const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="security-audit-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" });
    return res.status(200).send(csv);
  } catch (error) { next(error); }
};
