// models/Complaint.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "complaints";
const RESOLVED_STATUSES = new Set(["RESOLVED", "CLOSED", "COMPLETED"]);

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:               row.id,
    customerId:        row.customer_id,
    feedbackLinkId:    row.feedback_link_id,
    dealershipId:      row.dealership_id,
    vehicleNumber:     row.vehicle_number,
    audioUrl:          row.audio_url,
    englishTranscript: row.english_transcript || row.englishTranscript || row.transcript,
    confidenceScore:   row.confidence_score,
    transcriptFlagged: row.transcript_flagged,
    rating:            row.rating,
    ratedAt:           row.rated_at,
    serviceStatus:     row.service_status || "COMPLAINT_RECEIVED",
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
    resolvedAt:        row.resolved_at,
    voiceConsentAt:    row.voice_consent_at,
    retentionUntil:    row.retention_until,
    // Compat: save method for legacy worker code
    async save() {
      return Complaint.updateById(this.id, this);
    },
  };
};

export const Complaint = {
  async create(data) {
    const row = {
      customer_id:      data.customerId,
      feedback_link_id: data.feedbackLinkId || null,
      vehicle_number:   data.vehicleNumber?.toUpperCase(),
      audio_url:        data.audioUrl || null,
      transcript:       data.transcript || null,
      rating:           data.rating || null,
      status:           data.status || "AUDIO_UPLOADED",
      service_status:   data.serviceStatus || data.service_status || "COMPLAINT_RECEIVED",
      voice_consent_at: data.voiceConsentAt || data.voice_consent_at || null,
      privacy_notice_version: data.privacyNoticeVersion || data.privacy_notice_version || "2026-01",
      retention_until: data.retentionUntil || data.retention_until || null,
    };
    if (data.dealershipId || data.dealership_id) {
      row.dealership_id = data.dealershipId || data.dealership_id;
    }
    let { data: insertedRow, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select()
      .single();
    if (error && /service_status/i.test(error.message)) {
      delete row.service_status;
      const fallback = await supabase.from(TABLE).insert(row).select().single();
      insertedRow = fallback.data; error = fallback.error;
    }
    if (error) throw new Error(error.message);
    return norm(insertedRow);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findAll({ customerId, dealershipId } = {}) {
    let q = supabase.from(TABLE).select("*, customer:customers(name,vehicle_number,vehicle_model)").order("created_at", { ascending: false });
    if (customerId)   q = q.eq("customer_id", customerId);
    if (dealershipId) q = q.eq("dealership_id", dealershipId);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(norm);
  },

  async findByFeedbackLinkId(feedbackLinkId) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("feedback_link_id", feedbackLinkId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return norm(data);
  },

  async updateById(id, updates) {
    const row = {};
    if (updates.status            !== undefined) row.status             = updates.status;
    if (updates.serviceStatus     !== undefined) row.service_status     = updates.serviceStatus;
    if (updates.service_status    !== undefined) row.service_status     = updates.service_status;
    const nextServiceStatus = updates.serviceStatus || updates.service_status;
    if (nextServiceStatus !== undefined) row.resolved_at = String(nextServiceStatus).toUpperCase() === "RESOLVED" ? new Date().toISOString() : null;
    if (updates.status !== undefined && RESOLVED_STATUSES.has(String(updates.status).toUpperCase())) row.resolved_at = new Date().toISOString();
    if (updates.audioUrl          !== undefined) row.audio_url           = updates.audioUrl;
    if (updates.audio_url         !== undefined) row.audio_url           = updates.audio_url;
    if (updates.transcript        !== undefined) row.transcript         = updates.transcript;
    if (updates.englishTranscript !== undefined) row.english_transcript = updates.englishTranscript;
    if (updates.english_transcript!== undefined) row.english_transcript = updates.english_transcript;
    if (updates.language          !== undefined) row.language           = updates.language;
    if (updates.confidence_score  !== undefined) row.confidence_score   = updates.confidence_score;
    if (updates.confidenceScore   !== undefined) row.confidence_score   = updates.confidenceScore;
    if (updates.transcript_flagged!== undefined) row.transcript_flagged = updates.transcript_flagged;
    if (updates.transcriptFlagged !== undefined) row.transcript_flagged = updates.transcriptFlagged;
    if (updates.error             !== undefined) row.error              = updates.error;
    if (updates.rating            !== undefined) { row.rating = updates.rating; row.rated_at = new Date().toISOString(); }
    row.updated_at = new Date().toISOString();

    let { data, error } = await supabase.from(TABLE).update(row).eq("id", id).select().single();

    // Older Supabase projects may not yet expose the optional translated-text
    // column through PostgREST's schema cache. Keep the multilingual result
    // usable by retaining both texts in the established transcript field.
    if (error && /english_transcript/i.test(error.message)) {
      delete row.english_transcript;
      const original = String(updates.transcript || "").trim();
      const translation = String(updates.englishTranscript || updates.english_transcript || "").trim();
      if (original && translation && original !== translation) {
        row.transcript = `${original}\n\nEnglish translation:\n${translation}`;
      }
      ({ data, error } = await supabase.from(TABLE).update(row).eq("id", id).select().single());
    }

    if (error) throw new Error(error.message);
    return norm(data);
  },

  async deleteById(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
