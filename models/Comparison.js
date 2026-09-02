// models/Comparison.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "comparisons";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:               row.id,
    complaintId:       row.complaint_id,
    dealershipId:      row.dealership_id,
    invoiceId:         row.invoice_id,
    matchedIssues:     row.matched_issues     || [],
    missingIssues:     row.missing_issues     || [],
    extraInvoiceItems: row.extra_invoice_items || [],
    reportUrl:          row.report_url,
    reviewStatus:       row.review_status || "UNREVIEWED",
    reviewNotes:        row.review_notes || null,
    reviewedBy:         row.reviewed_by || null,
    reviewedAt:         row.reviewed_at || null,
    createdAt:         row.created_at,
  };
};

export const Comparison = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        complaint_id:        data.complaintId,
        dealership_id:       data.dealershipId || data.dealership_id || null,
        invoice_id:          data.invoiceId,
        matched_issues:      data.matchedIssues     || [],
        missing_issues:      data.missingIssues     || [],
        extra_invoice_items: data.extraInvoiceItems || [],
        score:               data.score,
        status:              data.status,
        summary:             data.summary,
        report_url:          data.reportUrl || null,
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

  async updateReviewByComplaintId(complaintId, { reviewStatus, reviewNotes, reviewedBy }) {
    const { data, error } = await supabase.from(TABLE).update({ review_status: reviewStatus, review_notes: reviewNotes || null, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq("complaint_id", complaintId).select().single();
    if (error) throw new Error(error.message);
    return norm(data);
  },
};
