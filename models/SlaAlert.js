import { supabase } from "../config/supabase.js";
export const SlaAlert = {
  async exists(complaintId, stage) { const { data } = await supabase.from("sla_alerts").select("id").eq("complaint_id", complaintId).eq("stage", stage).maybeSingle(); return Boolean(data); },
  async record(complaintId, stage) { const { error } = await supabase.from("sla_alerts").insert({ complaint_id: complaintId, stage }); if (error) throw new Error(error.message); },
};
