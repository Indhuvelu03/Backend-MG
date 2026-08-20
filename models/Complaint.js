// models/Complaint.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "complaints";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:              row.id,
    customerId:       row.customer_id,
    feedbackLinkId:   row.feedback_link_id,
    vehicleNumber:    row.vehicle_number,
    audioUrl:         row.audio_url,
    confidenceScore:  row.confidence_score,
    transcriptFlagged: row.transcript_flagged,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
    // Compat: save method for legacy worker code
    async save() {
      return Complaint.updateById(this.id, this);
    },
  };
};

export const Complaint = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        customer_id:      data.customerId,
        feedback_link_id: data.feedbackLinkId || null,
        vehicle_number:   data.vehicleNumber?.toUpperCase(),
        audio_url:        data.audioUrl || null,
        transcript:       data.transcript || null,
        status:           data.status || "AUDIO_UPLOADED",
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

  async findAll({ customerId } = {}) {
    let q = supabase.from(TABLE).select("*, customer:customers(name,vehicle_number,vehicle_model)").order("created_at", { ascending: false });
    if (customerId) q = q.eq("customer_id", customerId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(norm);
  },

  async updateById(id, updates) {
    const row = {};
    if (updates.status            !== undefined) row.status             = updates.status;
    if (updates.transcript        !== undefined) row.transcript         = updates.transcript;
    if (updates.language          !== undefined) row.language           = updates.language;
    if (updates.confidence_score  !== undefined) row.confidence_score   = updates.confidence_score;
    if (updates.confidenceScore   !== undefined) row.confidence_score   = updates.confidenceScore;
    if (updates.transcript_flagged!== undefined) row.transcript_flagged = updates.transcript_flagged;
    if (updates.transcriptFlagged !== undefined) row.transcript_flagged = updates.transcriptFlagged;
    if (updates.error             !== undefined) row.error              = updates.error;
    row.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from(TABLE).update(row).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(data);
  },

  async deleteById(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
