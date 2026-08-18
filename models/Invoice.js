// models/Invoice.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "invoices";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:              row.id,
    complaintId:      row.complaint_id,
    fileUrl:          row.file_url,
    extractedText:    row.extracted_text,
    extractionMethod: row.extraction_method,
    uploadedBy:       row.uploaded_by,
    createdAt:        row.created_at,
    async save() {
      return Invoice.updateById(this.id, this);
    },
  };
};

export const Invoice = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        complaint_id:     data.complaintId,
        file_url:         data.fileUrl,
        uploaded_by:      data.uploadedBy || null,
        status:           data.status || "UPLOADED",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findOne({ complaintId, status } = {}) {
    let q = supabase.from(TABLE).select("*");
    if (complaintId) q = q.eq("complaint_id", complaintId);
    if (status && typeof status === "object" && status.$ne) {
      q = q.neq("status", status.$ne);
    } else if (status) {
      q = q.eq("status", status);
    }
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return norm(data);
  },

  async updateById(id, updates) {
    const row = {};
    if (updates.status           !== undefined) row.status            = updates.status;
    if (updates.extractedText    !== undefined) row.extracted_text    = updates.extractedText;
    if (updates.extracted_text   !== undefined) row.extracted_text    = updates.extracted_text;
    if (updates.extractionMethod !== undefined) row.extraction_method = updates.extractionMethod;
    if (updates.extraction_method!== undefined) row.extraction_method = updates.extraction_method;

    const { data, error } = await supabase.from(TABLE).update(row).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(data);
  },

  async deleteById(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};