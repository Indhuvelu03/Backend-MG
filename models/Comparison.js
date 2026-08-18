// models/Comparison.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "comparisons";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:               row.id,
    complaintId:       row.complaint_id,
    invoiceId:         row.invoice_id,
    matchedIssues:     row.matched_issues     || [],
    missingIssues:     row.missing_issues     || [],
    extraInvoiceItems: row.extra_invoice_items || [],
    createdAt:         row.created_at,
  };
};

export const Comparison = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        complaint_id:        data.complaintId,
        invoice_id:          data.invoiceId,
        matched_issues:      data.matchedIssues     || [],
        missing_issues:      data.missingIssues     || [],
        extra_invoice_items: data.extraInvoiceItems || [],
        score:               data.score,
        status:              data.status,
        summary:             data.summary,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async findOne({ complaintId } = {}) {
    let q = supabase.from(TABLE).select("*");
    if (complaintId) q = q.eq("complaint_id", complaintId);
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return norm(data);
  },

  async findAll({ complaintId } = {}) {
    let q = supabase.from(TABLE).select("*");
    if (complaintId) q = q.eq("complaint_id", complaintId);
    const { data } = await q.order("created_at", { ascending: false });
    return (data || []).map(norm);
  },

  async deleteMany({ complaintId }) {
    const { error } = await supabase.from(TABLE).delete().eq("complaint_id", complaintId);
    if (error) throw new Error(error.message);
  },
};